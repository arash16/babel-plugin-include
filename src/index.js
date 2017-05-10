const { relative, resolve, dirname } = require('path');
const { existsSync, readFileSync } = require('fs');
const generate = require('babel-generator').default;


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
						id: moduleId,
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

function readModuleFile(file) {
    return readFileSync(file, 'utf8').toString();
}

export default function ({ File, types: t, traverse }) {
	function parse(code, srcFile) {
		const file = new File({
			sourceType: "module",
			filename: srcFile
		});
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
	            var source = readModuleFile(file.adr),
	                ast = parse(source, file.id);
	        }
	        catch (e) {
	            console.error("Error on Parsing Module: " + file.id, e.stack);
	            throw e;
	        }

	        return loadedModules[file.adr] = {
	        	adr: file.adr,
	            file: file.id,
	            folder: dirname(file.adr),
	            source: source,
	            ast: ast
	        }
        }

        console.error('Module ' + moduleId + ' not found.');
        return {};
    }

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

	function scopeHasModule(scope, adr) {
		while (scope) {
			if (scope.mods && scope.mods[adr])
				return true;

			scope = scope.parent;
		}
		return false;
	}

	return {
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
				// TODO: circular deps
				const { node } = path;
				if (!node.specifiers.length) {
					let curDir = dirname(resolve(node.loc.filename || path.hub.file.opts.filename));
					let moduleData = loadModule(curDir, node.source.value);
					if (moduleData.ast) {
						if (scopeHasModule(path.scope, moduleData.adr))
							path.remove();
						else {
							path.replaceWith(moduleData.ast);
							path.scope.mods = path.scope.mods || {};
							path.scope.mods[moduleData.adr] = true;
						}
					}
					// else path.remove();
				}
			}
		}
	};
};
