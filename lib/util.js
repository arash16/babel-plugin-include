'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.arrUnique = arrUnique;
exports.md5 = md5;
function arrUnique(arr) {
	var result = [];
	for (var i in arr) {
		if (result.indexOf(arr[i]) < 0) result.push(arr[i]);
	}return result;
};

var _require = require('crypto'),
    createHash = _require.createHash;

function md5(data) {
	return createHash('md5').update(data).digest("hex");
}