const { relative, resolve, dirname } = require('path');
const { existsSync, readFileSync } = require('fs');
const generate = require('babel-generator').default;


let newId = (last => (() => ++last))(0);

function arrUnique(arr) {
	let result = [];
	for (let i=0; i<arr.length; ++i)
		if (result.indexOf(arr[i]) < 0)
			result.push(arr[i]);
	return result;
}

function moduleFileExists(file) {
	if (!file.endsWith('.js')) file += '.js';
	return existsSync(file);
}

const providers = [
	function npmModuleProvider() {
		function findModuleFolder(baseDir, moduleId) {
			let curDir = resolve(baseDir);
			while (curDir != '/') {
				let result = curDir + '/node_modules/' + moduleId;
				if (existsSync(result + '/package.json'))
					return result;
				curDir = resolve(curDir + '/../');
			}
    	}

		const reNpmModule = /^\w.*/i;
		return function (baseDir, moduleId) {
			if (!reNpmModule.test(moduleId)) return;

			let moduleDir = findModuleFolder(baseDir, moduleId);
			let pckg = require(moduleDir + '/' + 'package.json');
			let src = pckg.includable || pckg.source;
			if (src) {
				let file = resolve(moduleDir, src);
				if (existsSync(file))
					return {
						id: relative('./', file),
						adr: file
					};
			}
		}
	}(),
	function localFileProvider(baseDir, moduleId) {
		let file = moduleId[0]=='.' ? resolve(baseDir, moduleId) : resolve(moduleId);
	    if (!moduleFileExists(file) && moduleFileExists(file + '/index'))
	        file += '/index';

	    if (!file.endsWith('.js')) file += '.js';
	    if (existsSync(file))
	    	return {
	    		id: relative('./', file),
	    		adr: file
	    	};
    }
];


export default function ({ File, types: t, traverse, version: bversion }) {
	function parse(code, srcFile) {
		let opts = {
			sourceType: "module",
			filename: srcFile
		};
		const file = new File(parseInt(bversion) == 6 ? opts : { options: opts, passes: [] });
		return file.wrap(code, function() {
			file.addCode(code);
			file.parseCode(code);
			return file.ast;
		});
	}


	let loadedModules = Object.create(null);
    function loadModule(baseDir, moduleId) {
    	let file;
        for (let i=0; !file && i<providers.length; ++i)
        	file = providers[i](baseDir, moduleId);

		if (file) {
		    if (loadedModules[file.adr])
		        return loadedModules[file.adr];

	        try {
	        	//console.log("Importing: " + file.adr);
	            var source = readFileSync(file.adr, 'utf8').toString(),
	                ast = parse(source, file.id);
	        }
	        catch (e) {
	            console.error("Error on Parsing Module: " + file.id, e.stack);
	            throw e;
	        }

	        return loadedModules[file.adr] = {
	        	id: newId(),
	            source: source,
	            file: file.id,
	            ast: ast,
	            importees: [],
	            importers: []
	        }
        }

        console.error('Module ' + moduleId + ' not found.');
    }

	// --------------------------------------------------------------------------------------

	function getRequiredSources(ast) {
		let files = {};
		traverse(ast, {
			enter: function (path) {
				let node = path.node;
				if (node && node.loc && node.loc.filename)
					files[node.loc.filename] = 1;
			}
		});

		return Object.keys(files);
	}

	// --------------------------------------------------------------------------------------

	function scopeHasModule(scope, adr) {
		while (scope) {
			if (scope.mods && scope.mods[adr])
				return true;

			scope = scope.parent;
		}
		return false;
	}

	let depsrels = {};
	function moduleIncludes(src, trg) {
		return src==trg || (depsrels[src] || {})[trg];
	}
	function includeModule(src, trg) {
		depsrels[src] = depsrels[src] || {};
		depsrels[src][trg] = true;

		let tgd = depsrels[trg] || {};
		for (let t in tgd)
			includeModule(src, tgd[t]);
	}

	// --------------------------------------------------------------------------------------

	function ModuleImportPath(mod, path) {
		this.module = mod;
		this.path = path;
	}


	let lmSeen = Object.create(null);
	function loadModulesRecursive(moduleData) {
		lmSeen[moduleData.id] = true;

		let curDir = dirname(resolve(moduleData.file));
		traverse(moduleData.ast, {
			ImportDeclaration: function(path) {
				const { node } = path;
				if (!node.specifiers.length) {
					let chldMod = loadModule(curDir, node.source.value);
					if (chldMod) {
						chldMod.importers.push(new ModuleImportPath(moduleData, path));
						moduleData.importees.push(new ModuleImportPath(chldMod, path));

						if (!lmSeen[chldMod.id])
							loadModulesRecursive(chldMod);
					}
				}
			}
		});
		return moduleData;
	}

	function findRequiredPaths(mod) {
		let frpSeen = Object.create(null);
		return function rec(mod) {
			let result = [];
			if (frpSeen[mod.id])
				return result;

			for (let imer of mod.importers)
				if (imer.module.rooted)
					result.push(imer.path);
				else
					[].push.apply(result, rec(imer.module));
			return result;
		}(mod)
	}

	return {
		pre: function (file) {
			let mainFile = file.opts.filename || file.parserOpts.sourceFileName,
				mainModu = loadedModules[resolve(mainFile)] = {
					id: newId(),
			        source: file.hub.file.code,
			        file: mainFile,
			        ast: file.ast,
			        importees: [],
			        importers: [],
			        rooted: true
				};

			loadModulesRecursive(mainModu);

			// BFS visit module importees
			let Q = [], bSeen = Object.create(null);
			for (let imee of mainModu.importees) {
				let mod = imee.module;
				if (!bSeen[mod.id]) {
					bSeen[mod.id] = true;
					Q.push(mod);
				}
			}

			while (Q.length) {
				let mod = Q.shift();
				if (mod.rooted) continue;

				let requiredPaths = arrUnique(findRequiredPaths(mod));
				let pos = requiredPaths[0].getEarliestCommonAncestorFrom(requiredPaths).getStatementParent();
				pos.insertBefore(mod.ast);

				// remove all import statements from all modules
				let imers = [];
				for (let imer of mod.importers) {
					imer.path.remove();
					imers[imer.module.id] = imer.module;
				}
				mod.importers.length = 0;

				// remove all imports from importees array of importer modules
				for (let i in imers) if (imers[i]) {
					let sz = 0, imes = imers[i].importees;
					for (let j=0; j<imes.length; ++j)
						if (imes[j].module != mod)
							imes[sz++] = imes[j];
					imes.length = sz;
				}



				mod.rooted = true;
				for (let imee of mod.importees)
					if (!imee.module.rooted)
						Q.push(imee.module);
			}

		},
		manipulateOptions(opts, parserOpts, file) {
			parserOpts.allowImportExportEverywhere = true;
			parserOpts.allowReturnOutsideFunction = true;
			if (parserOpts.sourceFileName && !parserOpts.sourceFilename)
				parserOpts.sourceFilename = parserOpts.sourceFileName;


			let gen = (opts.generatorOpts = opts.generatorOpts || {}).generator || generate;
			opts.generatorOpts.generator = function(ast, opts, code) {
				let sources = {},
					loadedFiles = Object.keys(loadedModules);

				getRequiredSources(ast).forEach(mod => sources[mod] = true);
				if (ast.program && sources[ast.loc.filename])
					sources[ast.loc.filename] = code;

				for (let fl in loadedModules) {
					let mod = loadedModules[fl];
					if (sources[mod.file])
						sources[mod.file] = mod.source;
				}

				for (let reqSrc in sources)
					if (sources[reqSrc] === true)
						throw new Error('Required source "' + reqSrc + '" not found.');

				return generate(ast.program || ast, opts, sources);
			}
		},
		visitor: {
			ImportDeclaration: function(path) {
				const { node } = path;
				if (!node.specifiers.length) {
					let curFile = node.loc.filename || path.hub.file.opts.filename,
						moduleData = loadModule(dirname(resolve(curFile)), node.source.value);

					if (moduleData) {
						if (moduleIncludes(moduleData.file, curFile)) {
							console.warn(`Circular Dependency from ${curFile}:${node.loc.start.line} to ${moduleData.file}`);
							path.remove();
						}
						else if (scopeHasModule(path.scope, moduleData.file))
							path.remove();
						else {
							includeModule(curFile, moduleData.file);

							path.replaceWith(moduleData.ast);
							path.scope.mods = path.scope.mods || {};
							path.scope.mods[moduleData.file] = true;
						}
					}
				}
			}
		}
	};
};
