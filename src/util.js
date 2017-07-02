export function arrUnique(arr) {
	let result = [];
	for (let i in arr)
		if (result.indexOf(arr[i]) < 0)
			result.push(arr[i]);
	return result;
};


let { createHash } = require('crypto');
export function md5(data) {
	return createHash('md5').update(data).digest("hex");
}
