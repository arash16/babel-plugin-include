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
		var file;
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
				file: file.id,
				folder: dirname(file.adr),
				source: source,
				ast: ast
			};
		}

		console.error('Module ' + moduleId + ' not found.');
		return {};
	}

	function getAllSources(ast) {
		var files = {};
		traverse(ast, {
			enter: function enter(path) {
				var node = path.node;
				if (node && node.loc && node.loc.filename) files[node.loc.filename] = 1;
			}
		});

		return Object.keys(files);
	}

	return {
		manipulateOptions: function manipulateOptions(opts, parserOpts, file) {
			parserOpts.allowImportExportEverywhere = true;
			parserOpts.allowReturnOutsideFunction = true;
			if (parserOpts.sourceFileName && !parserOpts.sourceFilename) parserOpts.sourceFilename = parserOpts.sourceFileName;

			var gen = (opts.generatorOpts = opts.generatorOpts || {}).generator || generate;
			opts.generatorOpts.generator = function (ast, opts, code) {
				var sources = {},
				    neededSources = getAllSources(ast),
				    loadedFiles = Object.keys(loadedModules);

				getAllSources(ast).forEach(function (mod) {
					return sources[mod] = true;
				});
				if (sources[ast.loc.filename]) sources[ast.loc.filename] = code;

				for (var fl in loadedModules) {
					var mod = loadedModules[fl];
					if (sources[mod.file]) sources[mod.file] = mod.source;
				}

				return generate(ast.program, opts, sources);
			};

			// parserOpts.parser = function() 
		},

		visitor: {
			ImportDeclaration: function ImportDeclaration(path) {
				var node = path.node;

				if (!node.specifiers.length) {
					var curDir = dirname(resolve(node.loc.filename || path.hub.file.opts.filename));
					var moduleData = loadModule(curDir, node.source.value);
					if (moduleData.ast) path.replaceWith(moduleData.ast);
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

var providers = [function localFileProvider(baseDir, moduleId) {
	var file = resolve(baseDir, moduleId);
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
