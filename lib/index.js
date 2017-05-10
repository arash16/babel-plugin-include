'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

exports.default = function (_ref) {
	var File = _ref.File,
	    t = _ref.types,
	    traverse = _ref.traverse;

	function parse(code, srcFile) {
		var file = new File({
			sourceType: "module",
			filename: srcFile
		});
		return file.wrap(code, function () {
			file.addCode(code);
			file.parseCode(code);
			return file.ast;
		});
	}

	var loadedModules = Object.create(null);
	function loadModule(baseDir, moduleId) {
		var file = void 0;
		for (var i = 0; !file && i < providers.length; ++i) {
			file = providers[i](baseDir, moduleId);
		}if (file) {
			if (loadedModules[file.adr]) return loadedModules[file.adr];

			try {
				//console.log("Importing: " + file.adr);
				var source = readModuleFile(file.adr),
				    ast = parse(source, file.id);
			} catch (e) {
				console.error("Error on Parsing Module: " + file.id, e.stack);
				throw e;
			}

			return loadedModules[file.adr] = {
				adr: file.adr,
				file: file.id,
				folder: dirname(file.adr),
				source: source,
				ast: ast
			};
		}

		console.error('Module ' + moduleId + ' not found.');
		return {};
	}

	function getRequiredSources(ast) {
		var files = {};
		traverse(ast, {
			enter: function enter(path) {
				var node = path.node;
				if (node && node.loc && node.loc.filename) files[node.loc.filename] = 1;
			}
		});

		return Object.keys(files);
	}

	function scopeHasModule(scope, adr) {
		while (scope) {
			if (scope.mods && scope.mods[adr]) return true;

			scope = scope.parent;
		}
		return false;
	}

	return {
		manipulateOptions: function manipulateOptions(opts, parserOpts, file) {
			parserOpts.allowImportExportEverywhere = true;
			parserOpts.allowReturnOutsideFunction = true;
			if (parserOpts.sourceFileName && !parserOpts.sourceFilename) parserOpts.sourceFilename = parserOpts.sourceFileName;

			var gen = (opts.generatorOpts = opts.generatorOpts || {}).generator || generate;
			opts.generatorOpts.generator = function (ast, opts, code) {
				var sources = {},
				    loadedFiles = Object.keys(loadedModules);

				getRequiredSources(ast).forEach(function (mod) {
					return sources[mod] = true;
				});
				if (ast.program && sources[ast.loc.filename]) sources[ast.loc.filename] = code;

				for (var fl in loadedModules) {
					var mod = loadedModules[fl];
					if (sources[mod.file]) sources[mod.file] = mod.source;
				}

				for (var reqSrc in sources) {
					if (sources[reqSrc] === true) throw new Error('Required source "' + reqSrc + '" not found.');
				}return generate(ast.program || ast, opts, sources);
			};
		},

		visitor: {
			ImportDeclaration: function ImportDeclaration(path) {
				// TODO: duplicate imports

				var node = path.node;

				if (!node.specifiers.length) {
					var curDir = dirname(resolve(node.loc.filename || path.hub.file.opts.filename));
					var moduleData = loadModule(curDir, node.source.value);
					if (moduleData.ast) {
						if (scopeHasModule(path.scope, moduleData.adr)) path.remove();else {
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

var _require = require('path'),
    relative = _require.relative,
    resolve = _require.resolve,
    dirname = _require.dirname;

var _require2 = require('fs'),
    existsSync = _require2.existsSync,
    readFileSync = _require2.readFileSync;

var generate = require('babel-generator').default;

function moduleFileExists(file) {
	if (!file.endsWith('.js')) file += '.js';
	return existsSync(file);
}

var providers = [function npmModuleProvider() {
	function findModuleFolder(baseDir, moduleId) {
		var curDir = resolve(baseDir);
		while (curDir != '/') {
			var result = curDir + '/node_modules/' + moduleId;
			if (existsSync(result + '/package.json')) return result;
			curDir = resolve(curDir + '/../');
		}
	}

	var reNpmModule = /^\w.*/i;
	return function (baseDir, moduleId) {
		if (!reNpmModule.test(moduleId)) return;

		var moduleDir = findModuleFolder(baseDir, moduleId);
		var pckg = require(moduleDir + '/' + 'package.json');
		var src = pckg.includable || pckg.source;
		if (src) {
			var file = resolve(moduleDir, src);
			if (existsSync(file)) return {
				id: moduleId,
				adr: file
			};
		}
	};
}(), function localFileProvider(baseDir, moduleId) {
	var file = moduleId[0] == '.' ? resolve(baseDir, moduleId) : resolve(moduleId);
	if (!moduleFileExists(file) && moduleFileExists(file + '/index')) file += '/index';

	if (!file.endsWith('.js')) file += '.js';
	if (existsSync(file)) return {
		id: relative('./', file),
		adr: file
	};
}];

function readModuleFile(file) {
	return readFileSync(file, 'utf8').toString();
}

;
