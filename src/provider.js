import { relative, resolve } from 'path';
import { existsSync } from 'fs';


export const providers = [];

export function findModule(moduleId, baseDir) {
    for (let provider of providers)
    	if (typeof provider=='function') {
			let file = provider(moduleId, baseDir);
			if (file) return file;
		}
};

// ------------------------------------------------------------------------------------------------

function moduleFileExists(file) {
	if (!file.endsWith('.js')) file += '.js';
	return existsSync(file);
}

providers.push(
	function npmModuleProvider() {
		function findModuleFolder(moduleId, baseDir) {
			let curDir = resolve(baseDir);
			while (curDir != '/') {
				let result = curDir + '/node_modules/' + moduleId;
				if (existsSync(result + '/package.json'))
					return result;
				curDir = resolve(curDir + '/../');
			}
		}

		const reNpmModule = /^\w.*/i;
		return function (moduleId, baseDir) {
			if (!reNpmModule.test(moduleId)) return;

			let modParts = moduleId.split('/');

			let moduleDir = findModuleFolder(modParts[0], baseDir);
			if (!moduleDir) return;

			let pckg = require(moduleDir + '/' + 'package.json');
			let src = pckg.includable;
			for (let i=1; i<modParts.length; ++i)
				if (src) src = src[modParts[i]];
				else return;

			if (typeof src == 'object')
				src = src[''] || src['index'];

			if (typeof src == 'string') {
				let file = resolve(moduleDir, src);
				if (existsSync(file))
					return {
						id: relative('./', file),
						adr: file
					};
			}
		}
	}()
);

providers.push(
	function localFileProvider(moduleId, baseDir) {
		let file = baseDir && moduleId[0]=='.' ? resolve(baseDir, moduleId) : resolve(moduleId);
	    if (!moduleFileExists(file) && moduleFileExists(file + '/index'))
	        file += '/index';

	    if (!file.endsWith('.js')) file += '.js';
	    if (existsSync(file))
	    	return {
	    		id: relative('./', file),
	    		adr: file
	    	};
    }
);
