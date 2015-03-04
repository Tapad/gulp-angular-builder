var Node = require("./Node"),
	path = require("path"),
	gutil = require("gulp-util"),
	GraphError = require("./errors").GraphError;

var cwd = process.cwd();

var Graph = function (seeds, options) {
	this.nodes = {};

	this.init(seeds, options);
};

Graph.prototype.init = function (seeds, options) {
	this.seeds = (seeds || []).map(function (seed) {
		return path.relative(cwd, path.resolve(seed));
	});

	this.options = options;
};

Graph.prototype.add = function (file) {
	var options = this.options,
		fp = path.relative(cwd, file.path);

	if (this.nodes[fp]) {
		var cached = this.nodes[fp].file;
		if (+file.stat.mtime <= +cached.stat.mtime) {
			return;
		}
	}

	if (options.verbose) {
		gutil.log(gutil.colors.magenta((file.event ? file.event.toUpperCase() : "ADD") + ": ") + fp);
	}

	var unparsed = pathMatches(fp, options.requiredLibs) || pathMatches(fp, options.optionalLibsInclude) || pathMatches(fp, options.parseExclude),
		required = pathMatches(fp, options.requiredLibs) || pathMatches(fp, options.requiredFiles) || pathMatches(fp, this.seeds);

	var node = new Node(file, unparsed);

	if (required) {
		node.metadata.isRequired();
	}

	this.nodes[fp] = node;
};

Graph.prototype.remove = function (file) {
	var fp = path.relative(cwd, file.path);

	if (this.options.verbose) {
		gutil.log(gutil.colors.red("DELETE: ") + fp);
	}

	delete this.nodes[fp];
};

Graph.prototype.build = function () {
	var modules = [],
		nodeMap = {},
		resolvesMap = {},
		optionalList = [],
		required = [],
		nodes = this.nodes;

	var globalDependencies = this.options.globalDependencies,
		optionalLibs = this.options.optionalLibs,
		optionalLibsInclude = this.options.optionalLibsInclude,
		filePriority = this.options.filePriority,
		appModule = this.options.appModule,
		globalModules = this.options.globalModules,
		verbose = this.options.verbose,
		debug = this.options.debug;

	// Turn global dependencies into a map
	globalDependencies = globalDependencies.reduce(function (memo, key) {
		memo[key] = true;
		return memo;
	}, {});

	// Form the node map
	Object.keys(nodes).forEach(function (path) {
		var node = nodes[path],
			items = node.metadata.items;

		nodeMap[path] = node;

		Object.keys(items).forEach(function (item) {
			items[item].forEach(function (component) {
				var key = component;
				if (item == "directive" || item == "filter" || item == "animation") {
					key = item + ":" + component;
				}

				if (nodeMap[key]) {
					throw new GraphError("Component already defined", key, [nodeMap[key].path, node.path]);
				}
				nodeMap[key] = node;
			});
		});

		if (pathMatches(path, optionalLibsInclude)) {
			optionalList.push(path);
		}
	});

	// Form the resolves map
	Object.keys(nodes).forEach(function (path) {
		var node = nodes[path];

		var resolves = node.metadata.resolves,
			fileResolves = [];
		Object.keys(resolves).forEach(function (item) {
			resolvesMap[item] = resolves[item];
			fileResolves = fileResolves.concat(resolves[item]);
		});

		resolvesMap[path] = fileResolves;
	});

	// Compile the required list
	Object.keys(nodes).forEach(function (path) {
		var node = nodes[path];

		if (node.metadata.type.required) {
			addRequired(path);
		}
	});
	gutil.log("Requiring " + gutil.colors.magenta(required.length) + " file(s)");

	// Sort required list
	required.sort(function (a, b) {
		var ap = getPriority(filePriority, a.path),
			bp = getPriority(filePriority, b.path);
		if (ap == bp) {
			return a.path > b.path ? 1 : -1;
		}
		return ap > bp ? -1 : 1;
	});

	// Get the modules
	required.forEach(function (node) {
		node.metadata.modules.forEach(function (module) {
			if (!!~modules.indexOf(module) || module == appModule) {
				return;
			}
			modules.push(module);
		});
	});

	// Create init file
	var initFile = new gutil.File({
		cwd: process.cwd(),
		base: "",
		path: "init.js",
		contents: new Buffer('angular.module("' + appModule + '", ' + JSON.stringify(globalModules.concat(modules)) + ');\n\n')
	});
	required.unshift(new Node(initFile, true));

	return required;



	// Helper
	function addRequired(key, optional, parent) {
		var node = nodeMap[key];

		if (!node) {
			if (!optional && !globalDependencies[key]) {
				throw new GraphError("Cannot find required component", key, (parent ? parent.path : "n/a (seed)"));
			}
			return;
		}

		// Already required, don't need to add it again
		if (!!~required.indexOf(node)) {
			return;
		}

		if (verbose && debug) {
			gutil.log(gutil.colors.green("REQUIRING: ") + key);
		}

		required.push(node);


		// Require all dependencies
		var deps = node.metadata.dependencies;

		deps.component.forEach(function (component) {
			if (resolvesMap[key] && !!~resolvesMap[key].indexOf(component)) {
				return;
			}
			addRequired(component, false, node);
		});

		deps.template.forEach(function (template) {
			addRequired(template, false, node);
		});

		deps.filter.forEach(function (filter) {
			addRequired("filter:" + filter, false, node);
		});

		deps.templateToken.forEach(function (template) {
			addRequired(template, true, node);
		});

		deps.directiveToken.forEach(function (directive) {
			addRequired("directive:" + directive, true, node);
		});

		deps.animationToken.forEach(function (animation) {
			addRequired("animation:" + animation, true, node);
		});

		// Check if optional library, if so, require children includes
		if (pathMatches(node.path, optionalLibs)) {
			var dir = path.dirname(node.path) + path.sep;
			optionalList.forEach(function (optPath) {
				if (!!optPath.indexOf(dir)) {
					return;
				}
				addRequired(optPath);
			});
		}
	}
};

module.exports = Graph;



/**
 * Helper functions
 */

function pathMatches(path, check, every) {
	if (check instanceof Array) {
		return check[every ? "every" : "some"](function (check) {
			return !!path.match(check);
		});
	}

	return !!path.match(check);
}

function getPriority(priorityList, path) {
	var l = priorityList.length;
	return l - priorityList.reduce(function (priority, item, i) {
		if (priority < l) {
			return priority;
		}
		return !!path.match(item) ? i : priority;
	}, l);
}