"use strict";

Object.defineProperty(exports, "__esModule", {
	value: true
});
exports.arrUnique = arrUnique;
function arrUnique(arr) {
	var result = [];
	for (var i in arr) {
		if (result.indexOf(arr[i]) < 0) result.push(arr[i]);
	}return result;
};