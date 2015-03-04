var through = require("through2"),
	gutil = require("gulp-util"),
	Graph = require("./lib/Graph"),
	filters = require("./consts/angular-filters");

module.exports = function (seeds, options) {
	options = parseOptions(options);
	var graph = new Graph(seeds, options);

	return through.obj(function (file, enc, next) {
		try {
			graph.add(file);
			next();
		} catch (e) {
			this.emit("error", e);
		}
	}, function (next) {
		var stream = this;
		try {
			graph.build().forEach(function (node) {
				stream.push(node.file);
			});

			next();
		} catch (e) {
			this.emit("error", e);
		}
	});
};


module.exports.watch = function (seeds, options) {
	options = parseOptions(options);
	var graph = new Graph(seeds, options);

	out = {};

	out.builder = function () {
		return through.obj(function (file, enc, next) {
			try {
				graph.add(file);
				next();
			} catch (e) {
				this.emit("error", e);
			}
		}, function (next) {
			var stream = this;
			try {
				graph.build().forEach(function (node) {
					stream.push(node.file.clone());
				});

				next();
			} catch (e) {
				this.emit("error", e);
			}
		});
	};

	out.update = function (file) {
		switch (file.event) {
		case "add":
		case "change":
			graph.add(file);
			break;
		case "unlink":
			graph.remove(file);
			break;
		}
	};

	return out;
};

function parseOptions(options) {
	// TODO: add defaults

	filters.forEach(function (filter) {
		options.globalDependencies.push("filter:" + filter);
	});
	return options;
}