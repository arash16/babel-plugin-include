'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.providers = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

exports.findModule = findModule;

var _path = require('path');

var _fs = require('fs');

var providers = exports.providers = [];

function findModule(moduleId, baseDir) {
	var _iteratorNormalCompletion = true;
	var _didIteratorError = false;
	var _iteratorError = undefined;

	try {
		for (var _iterator = providers[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
			var provider = _step.value;

			if (typeof provider == 'function') {
				var file = provider(moduleId, baseDir);
				if (file) return file;
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
};

// ------------------------------------------------------------------------------------------------

function moduleFileExists(file) {
	if (!file.endsWith('.js')) file += '.js';
	return (0, _fs.existsSync)(file);
}

providers.push(function npmModuleProvider() {
	function findModuleFolder(moduleId, baseDir) {
		var curDir = (0, _path.resolve)(baseDir);
		while (curDir != '/') {
			var result = curDir + '/node_modules/' + moduleId;
			if ((0, _fs.existsSync)(result + '/package.json')) return result;
			curDir = (0, _path.resolve)(curDir + '/../');
		}
	}

	var reNpmModule = /^\w.*/i;
	return function (moduleId, baseDir) {
		if (!reNpmModule.test(moduleId)) return;

		var modParts = moduleId.split('/');

		var moduleDir = findModuleFolder(modParts[0], baseDir);
		if (!moduleDir) return;

		var pckg = require(moduleDir + '/' + 'package.json');
		var src = pckg.includable;
		for (var i = 1; i < modParts.length; ++i) {
			if (src) src = src[modParts[i]];else return;
		}if ((typeof src === 'undefined' ? 'undefined' : _typeof(src)) == 'object') src = src[''] || src['index'];

		if (typeof src == 'string') {
			var file = (0, _path.resolve)(moduleDir, src);
			if ((0, _fs.existsSync)(file)) return {
				id: (0, _path.relative)('./', file),
				adr: file
			};
		}
	};
}());

providers.push(function localFileProvider(moduleId, baseDir) {
	var file = baseDir && moduleId[0] == '.' ? (0, _path.resolve)(baseDir, moduleId) : (0, _path.resolve)(moduleId);
	if (!moduleFileExists(file) && moduleFileExists(file + '/index')) file += '/index';

	if (!file.endsWith('.js')) file += '.js';
	if ((0, _fs.existsSync)(file)) return {
		id: (0, _path.relative)('./', file),
		adr: file
	};
});