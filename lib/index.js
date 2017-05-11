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
			filename: srcFile
		};
		var file = new File(parseInt(bversion) == 6 ? opts : { options: opts, passes: [] });
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
				var source = readFileSync(file.adr, 'utf8').toString(),
				    ast = parse(source, file.id);
			} catch (e) {
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
			};
		}

		console.error('Module ' + moduleId + ' not found.');
	}

	// --------------------------------------------------------------------------------------

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

	// --------------------------------------------------------------------------------------

	function scopeHasModule(scope, adr) {
		while (scope) {
			if (scope.mods && scope.mods[adr]) return true;

			scope = scope.parent;
		}
		return false;
	}

	var depsrels = {};
	function moduleIncludes(src, trg) {
		return src == trg || (depsrels[src] || {})[trg];
	}
	function includeModule(src, trg) {
		depsrels[src] = depsrels[src] || {};
		depsrels[src][trg] = true;

		var tgd = depsrels[trg] || {};
		for (var _t in tgd) {
			includeModule(src, tgd[_t]);
		}
	}

	// --------------------------------------------------------------------------------------

	function ModuleImportPath(mod, path) {
		this.module = mod;
		this.path = path;
	}

	var lmSeen = Object.create(null);
	function loadModulesRecursive(moduleData) {
		lmSeen[moduleData.id] = true;

		var curDir = dirname(resolve(moduleData.file));
		traverse(moduleData.ast, {
			ImportDeclaration: function ImportDeclaration(path) {
				var node = path.node;

				if (!node.specifiers.length) {
					var chldMod = loadModule(curDir, node.source.value);
					if (chldMod) {
						chldMod.importers.push(new ModuleImportPath(moduleData, path));
						moduleData.importees.push(new ModuleImportPath(chldMod, path));

						if (!lmSeen[chldMod.id]) loadModulesRecursive(chldMod);
					}
				}
			}
		});
		return moduleData;
	}

	function findRequiredPaths(mod) {
		var frpSeen = Object.create(null);
		return function rec(mod) {
			var result = [];
			if (frpSeen[mod.id]) return result;

			var _iteratorNormalCompletion = true;
			var _didIteratorError = false;
			var _iteratorError = undefined;

			try {
				for (var _iterator = mod.importers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
					var imer = _step.value;

					if (imer.module.rooted) result.push(imer.path);else [].push.apply(result, rec(imer.module));
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
		}(mod);
	}

	return {
		pre: function pre(file) {
			var mainFile = file.opts.filename || file.parserOpts.sourceFileName,
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
			var Q = [],
			    bSeen = Object.create(null);
			var _iteratorNormalCompletion2 = true;
			var _didIteratorError2 = false;
			var _iteratorError2 = undefined;

			try {
				for (var _iterator2 = mainModu.importees[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
					var imee = _step2.value;

					var mod = imee.module;
					if (!bSeen[mod.id]) {
						bSeen[mod.id] = true;
						Q.push(mod);
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

			while (Q.length) {
				var mod = Q.shift();
				if (mod.rooted) continue;

				var requiredPaths = arrUnique(findRequiredPaths(mod));
				var pos = requiredPaths[0].getEarliestCommonAncestorFrom(requiredPaths).getStatementParent();
				pos.insertBefore(mod.ast);

				// remove all import statements from all modules
				var imers = [];
				var _iteratorNormalCompletion3 = true;
				var _didIteratorError3 = false;
				var _iteratorError3 = undefined;

				try {
					for (var _iterator3 = mod.importers[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
						var imer = _step3.value;

						imer.path.remove();
						imers[imer.module.id] = imer.module;
					}
				} catch (err) {
					_didIteratorError3 = true;
					_iteratorError3 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion3 && _iterator3.return) {
							_iterator3.return();
						}
					} finally {
						if (_didIteratorError3) {
							throw _iteratorError3;
						}
					}
				}

				mod.importers.length = 0;

				// remove all imports from importees array of importer modules
				for (var i in imers) {
					if (imers[i]) {
						var sz = 0,
						    imes = imers[i].importees;
						for (var j = 0; j < imes.length; ++j) {
							if (imes[j].module != mod) imes[sz++] = imes[j];
						}imes.length = sz;
					}
				}mod.rooted = true;
				var _iteratorNormalCompletion4 = true;
				var _didIteratorError4 = false;
				var _iteratorError4 = undefined;

				try {
					for (var _iterator4 = mod.importees[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
						var _imee = _step4.value;

						if (!_imee.module.rooted) Q.push(_imee.module);
					}
				} catch (err) {
					_didIteratorError4 = true;
					_iteratorError4 = err;
				} finally {
					try {
						if (!_iteratorNormalCompletion4 && _iterator4.return) {
							_iterator4.return();
						}
					} finally {
						if (_didIteratorError4) {
							throw _iteratorError4;
						}
					}
				}
			}
		},
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
				var node = path.node;

				if (!node.specifiers.length) {
					var curFile = node.loc.filename || path.hub.file.opts.filename,
					    moduleData = loadModule(dirname(resolve(curFile)), node.source.value);

					if (moduleData) {
						if (moduleIncludes(moduleData.file, curFile)) {
							console.warn('Circular Dependency from ' + curFile + ':' + node.loc.start.line + ' to ' + moduleData.file);
							path.remove();
						} else if (scopeHasModule(path.scope, moduleData.file)) path.remove();else {
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

var _require = require('path'),
    relative = _require.relative,
    resolve = _require.resolve,
    dirname = _require.dirname;

var _require2 = require('fs'),
    existsSync = _require2.existsSync,
    readFileSync = _require2.readFileSync;

var generate = require('babel-generator').default;

var newId = function (last) {
	return function () {
		return ++last;
	};
}(0);

function arrUnique(arr) {
	var result = [];
	for (var i = 0; i < arr.length; ++i) {
		if (result.indexOf(arr[i]) < 0) result.push(arr[i]);
	}return result;
}

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
				id: relative('./', file),
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

;
