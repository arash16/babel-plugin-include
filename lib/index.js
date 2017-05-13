'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

exports.default = function (_ref) {
	var File = _ref.File,
	    t = _ref.types,
	    traverse = _ref.traverse,
	    bversion = _ref.version;

	function parse(code, srcFile) {
		var opts = {
			sourceType: "module",
			filename: srcFile,
			parserOpts: {
				allowImportExportEverywhere: true,
				allowReturnOutsideFunction: true
			}
		};
		var file = new File(parseInt(bversion) == 6 ? opts : { options: opts, passes: [] });
		return file.wrap(code, function () {
			file.addCode(code);
			file.parseCode(code);
			return file.ast;
		});
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

	var loader = new _repository.Repository({ parse: parse, traverse: traverse });
	return {
		pre: function pre(file) {
			var mainFile = file.opts.filename || file.parserOpts.sourceFileName,
			    mainModu = loader.loadModulesRecursive({
				adr: (0, _path.resolve)(mainFile),
				file: mainFile,
				ast: file.ast,
				source: file.hub.file.code
			});

			// BFS visit module importees
			var Q = [],
			    bSeen = [];
			bSeen[mainModu.id] = true;
			var _iteratorNormalCompletion = true;
			var _didIteratorError = false;
			var _iteratorError = undefined;

			try {
				for (var _iterator = mainModu.importees[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
					var imee = _step.value;

					var mod = imee.module;
					if (!bSeen[mod.id]) {
						bSeen[mod.id] = true;
						Q.push(mod);
					}
				}
			} catch (err) {
				_didIteratorError = true;
				_iteratorError = err;
			} finally {
				try {
					if (!_iteratorNormalCompletion && _iterator.return) {
						_iterator.return();
					}
				} finally {
					if (_didIteratorError) {
						throw _iteratorError;
					}
				}
			}

			var _loop = function _loop() {
				var mod = Q.shift();

				var moduleImportPaths = loader.findRequiredPaths(mod);
				var lcaMod = loader.lcaModules((0, _util.arrUnique)(moduleImportPaths.map(function (x) {
					return x.module;
				})));
				var requiredPaths = (0, _util.arrUnique)(moduleImportPaths.filter(function (x) {
					return x.module == lcaMod;
				}).map(function (x) {
					return x.path;
				}));

				var pos = requiredPaths[0].getEarliestCommonAncestorFrom(requiredPaths).getStatementParent();
				var relfile = (0, _path.relative)((0, _path.dirname)(lcaMod.adr), mod.adr);
				if (relfile[0] != '.') relfile = './' + relfile;
				var vast = t.importDeclaration([], t.stringLiteral(relfile));
				vast.loc = { filename: pos.node.loc.filename };
				pos.insertBefore(vast);

				var _iteratorNormalCompletion2 = true;
				var _didIteratorError2 = false;
				var _iteratorError2 = undefined;

				try {
					for (var _iterator2 = mod.importees[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
						var _imee = _step2.value;

						if (!bSeen[_imee.module.id]) {
							bSeen[_imee.module.id] = true;
							Q.push(_imee.module);
						}
					}
				} catch (err) {
					_didIteratorError2 = true;
					_iteratorError2 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion2 && _iterator2.return) {
							_iterator2.return();
						}
					} finally {
						if (_didIteratorError2) {
							throw _iteratorError2;
						}
					}
				}
			};

			while (Q.length) {
				_loop();
			}

			this.modulesPlaced = [];
		},
		manipulateOptions: function manipulateOptions(opts, parserOpts, file) {
			parserOpts.allowImportExportEverywhere = true;
			parserOpts.allowReturnOutsideFunction = true;
			if (parserOpts.sourceFileName && !parserOpts.sourceFilename) parserOpts.sourceFilename = parserOpts.sourceFileName;

			var gen = (opts.generatorOpts = opts.generatorOpts || {}).generator || _babelGenerator2.default;
			opts.generatorOpts.generator = function (ast, opts, code) {
				var sources = {},
				    loadedFiles = Object.keys(loader.loadedModules);

				getRequiredSources(ast).forEach(function (mod) {
					return sources[mod] = true;
				});
				if (ast.program && sources[ast.loc.filename]) sources[ast.loc.filename] = code;

				for (var fl in loader.loadedModules) {
					var _mod = loader.loadedModules[fl];
					if (sources[_mod.file]) sources[_mod.file] = _mod.source;
				}

				for (var reqSrc in sources) {
					if (sources[reqSrc] === true) throw new Error('Required source "' + reqSrc + '" not found.');
				}return (0, _babelGenerator2.default)(ast.program || ast, opts, sources);
			};
		},

		visitor: {
			ImportDeclaration: function ImportDeclaration(path) {
				var node = path.node;

				if (!node.specifiers.length) {
					var curFile = node.loc.filename || path.hub.file.opts.filename,
					    moduleData = loader.loadModule(node.source.value, (0, _path.dirname)((0, _path.resolve)(curFile)));

					if (moduleData) {
						if (this.modulesPlaced[moduleData.id] || !moduleData.depth) path.remove();else {
							this.modulesPlaced[moduleData.id] = true;
							path.replaceWith(moduleData.ast);
						}
					}
				}
			}
		}
	};
};

var _babelGenerator = require('babel-generator');

var _babelGenerator2 = _interopRequireDefault(_babelGenerator);

var _path = require('path');

var _repository = require('./repository');

var _util = require('./util');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

;