const { relative, resolve, dirname } = require('path');
const { existsSync, readFileSync } = require('fs');
const generate = require('babel-generator').default;


let newId = (last => (() => ++last))(0);

function arrUnique(arr) {
	let result = [];
	for (let i in arr)
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
			if (!moduleDir) return;

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
			filename: srcFile,
			parserOpts: {
				allowImportExportEverywhere: true,
				allowReturnOutsideFunction: true
			}
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
	        	adr: file.adr,
	            source: source,
	            file: file.id,
	            ast: ast,
	            importees: [],
	            importers: [],
	            depth: Infinity
	        }
        }
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
						chldMod.depth = Math.min(chldMod.depth, moduleData.depth + 1);
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


	function findRequiredPaths(mod1) {
		let frpSeen = Object.create(null);
		return arrUnique(function rec1(mod) {
			let result = [];
			if (frpSeen[mod.id])
				return result;
			frpSeen[mod.id] = true;

			for (let imer of mod.importers) {
				if (imer.module != mod1)
					result.push(imer);

				if (imer.module.depth > 0)
					[].push.apply(result, rec1(imer.module));
			}
			return result;
		}(mod1));
	}

	function ascendents(mod) {
		let result = [];
		(function rec2(mod) {
			result[mod.id] = 1;
			for (let imer of mod.importers)
				if (!result[imer.module.id])
					rec2(imer.module);
		})(mod);

		return result;
	}

	function lcaModules(mods) {
		let modDatas = [], intersect = ascendents(mods[0]);
		mods.forEach((mod, i) => {
			modDatas[mod.id] = mod;
			if (!i) return;

			let aa = ascendents(mod);
			for (let i in intersect)
				if (!aa[i])
					delete intersect[i];
		});

		// common ancestors
		let coma = [];
		for (let i in intersect)
			coma.push(modDatas[i]);

		// sort descending on depth
		coma.sort((a, b) => a.depth < b.depth);
		let best = coma[coma.length-1];
		for (let i=0; i<coma.length; ++i)
			if (!coma[i+1] || coma[i+1].depth!=coma[i].depth)
				return coma[i];
	}

	return {
		pre: function (file) {
			let mainFile = file.opts.filename || file.parserOpts.sourceFileName,
				mainFileAdr = resolve(mainFile),
				mainModu = loadedModules[mainFileAdr] = {
					id: newId(),
					adr: mainFileAdr,
			        source: file.hub.file.code,
			        file: mainFile,
			        ast: file.ast,
			        importees: [],
			        importers: [],
			        depth: 0
				};

			loadModulesRecursive(mainModu);

			// BFS visit module importees
			let Q = [], bSeen = Object.create(null);
			bSeen[mainModu.id] = true;
			for (let imee of mainModu.importees) {
				let mod = imee.module;
				if (!bSeen[mod.id]) {
					bSeen[mod.id] = true;
					Q.push(mod);
				}
			}

			while (Q.length) {
				let mod = Q.shift();

				let moduleImportPaths = findRequiredPaths(mod);
				let lcaMod = lcaModules(arrUnique(moduleImportPaths.map(x => x.module)));
				let requiredPaths = arrUnique(moduleImportPaths.filter(x => x.module == lcaMod).map(x => x.path));


				let pos = requiredPaths[0].getEarliestCommonAncestorFrom(requiredPaths).getStatementParent();
				let relfile = relative(dirname(lcaMod.adr), mod.adr);
				if (relfile[0]!='.') relfile = './' + relfile;
				let vast = t.importDeclaration([], t.stringLiteral( relfile ));
				vast.loc = { filename: pos.node.loc.filename };
				pos.insertBefore(vast);

				for (let imee of mod.importees)
					if (!bSeen[imee.module.id]) {
						bSeen[imee.module.id] = true;
						Q.push(imee.module);
					}
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
						if (moduleData.placed || !moduleData.depth) path.remove();
						else {
							moduleData.placed = true;
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
