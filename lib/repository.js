'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.Repository = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _provider = require('./provider');

var _path = require('path');

var _fs = require('fs');

var _util = require('./util');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ModuleImportPath = function ModuleImportPath(module, path) {
	_classCallCheck(this, ModuleImportPath);

	this.module = module;
	this.path = path;
};

;

var Repository = exports.Repository = function () {
	function Repository(_ref) {
		var parse = _ref.parse,
		    traverse = _ref.traverse;

		_classCallCheck(this, Repository);

		this.parse = parse;
		this.traverse = traverse;

		this.loadedModules = Object.create(null);
		this.loadedContents = Object.create(null);
		this.modules = [];
	}

	_createClass(Repository, [{
		key: 'addModule',
		value: function addModule(filename, adr, source, ast) {
			if (this.loadedModules[adr]) return this.loadedModules[adr];

			var hash = (0, _util.md5)(source.trim());
			if (this.loadedContents[hash]) return this.loadedContents[hash];

			if (ast === undefined) {
				try {
					ast = this.parse(source, filename);
				} catch (e) {
					console.error("Error on Parsing Module: " + filename, e.stack);
					throw e;
				}
			}

			var modData = this.loadedModules[adr] = this.loadedContents[hash] = {
				id: this.modules.length,
				adr: adr,
				ast: ast,
				file: filename,
				source: source,
				importees: [],
				importers: [],
				depth: Infinity
			};

			this.modules.push(modData);
			return modData;
		}
	}, {
		key: 'loadModule',
		value: function loadModule(moduleId, baseDir) {
			var file = (0, _provider.findModule)(moduleId, baseDir);
			if (!file) return;

			return this.addModule(file.id, file.adr, (0, _fs.readFileSync)(file.adr, 'utf8').toString());
		}
	}, {
		key: 'loadModulesRecursive',
		value: function loadModulesRecursive(mod, baseDir) {
			var root = typeof mod == 'string' ? this.loadModule(mod, baseDir) : this.addModule(mod.file, mod.adr, mod.source, mod.ast);
			root.depth = 0;

			var that = this;
			var lmSeen = [];
			(function loadRecursive(moduleData) {
				lmSeen[moduleData.id] = true;

				var curDir = (0, _path.dirname)((0, _path.resolve)(moduleData.file));
				that.traverse(moduleData.ast, {
					ImportDeclaration: function ImportDeclaration(path) {
						var node = path.node;

						if (!node.specifiers.length) {
							var chldMod = that.loadModule(node.source.value, curDir);
							if (chldMod) {
								chldMod.depth = Math.min(chldMod.depth, moduleData.depth + 1);
								chldMod.importers.push(new ModuleImportPath(moduleData, path));
								moduleData.importees.push(new ModuleImportPath(chldMod, path));
								if (!lmSeen[chldMod.id]) loadRecursive(chldMod);
							}
						}
					}
				});
			})(root);
			return root;
		}
	}, {
		key: 'findRequiredPaths',
		value: function findRequiredPaths(mod1) {
			var frpSeen = [];
			return (0, _util.arrUnique)(function rec1(mod) {
				var result = [];
				if (frpSeen[mod.id]) return result;
				frpSeen[mod.id] = true;

				var _iteratorNormalCompletion = true;
				var _didIteratorError = false;
				var _iteratorError = undefined;

				try {
					for (var _iterator = mod.importers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
						var imer = _step.value;

						if (imer.module != mod1) result.push(imer);

						if (imer.module.depth > 0) [].push.apply(result, rec1(imer.module));
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

				return result;
			}(mod1));
		}
	}, {
		key: 'ascendents',
		value: function ascendents(mod) {
			var result = [];
			(function rec2(mod) {
				result[mod.id] = 1;
				var _iteratorNormalCompletion2 = true;
				var _didIteratorError2 = false;
				var _iteratorError2 = undefined;

				try {
					for (var _iterator2 = mod.importers[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
						var imer = _step2.value;

						if (!result[imer.module.id]) rec2(imer.module);
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
			})(mod);
			return result;
		}
	}, {
		key: 'lcaModules',
		value: function lcaModules(mods) {
			var that = this;
			var intersect = this.ascendents(mods[0]);
			mods.forEach(function (mod, i) {
				if (!i) return;

				var aa = that.ascendents(mod);
				for (var _i in intersect) {
					if (!aa[_i]) delete intersect[_i];
				}
			});

			// common ancestors
			var coma = [];
			for (var i in intersect) {
				coma.push(this.modules[i]);
			} // sort descending on depth
			coma.sort(function (a, b) {
				return a.depth < b.depth;
			});
			var best = coma[coma.length - 1];
			for (var _i2 = 0; _i2 < coma.length; ++_i2) {
				if (!coma[_i2 + 1] || coma[_i2 + 1].depth != coma[_i2].depth) return coma[_i2];
			}
		}
	}]);

	return Repository;
}();

;