var path = require("path"),
	MetaDataError = require("./errors").MetaDataError;

var cwd = process.cwd();


var MetaData = function (path) {
	this.path = path;

	this.parsed = false;

	this.modules = [];

	this.dependencies = {
		component: [],
		filter: [],
		template: [],
		templateToken: [],
		directiveToken: [],
		animationToken: []
	};

	this.items = {
		provider: [],
		factory: [],
		service: [],
		value: [],
		constant: [],
		controller: [],
		animation: [],
		filter: [],
		directive: []
	};

	this.resolves = {};

	this.type = {
		app: false,
		config: false,
		run: false,
		required: false
	};
};

MetaData.prototype.addResolve = function (item, resolve) {
	item = item || "__self";
	var resolves = this.resolves[item] = this.resolves[item] || [];
	if (!~this.resolves[item].indexOf(resolve)) {
		this.resolves[item].push(resolve);
	}
};

MetaData.prototype.addModule = function (module) {
	if (!~this.modules.indexOf(module)) {
		this.modules.push(module);
	}
};

MetaData.prototype.addDependency = function (type, dep) {
	if (!this.dependencies[type]) {
		throw new MetaDataError("dependency", type, dep, this.path);
	}

	if (type == "component") {
		if (dep[0] == "$" || !dep.indexOf("ng")) {
			return;
		}
		if (!!~dep.indexOf(" as ")) {
			dep = dep.split(" as ")[0];
		}
		dep = dep.replace("Provider", "");
	}

	if (type == "templateToken") {
		dep = getTemplatePath(dep);

		// templateToken is already in template, don't need to add it as a token
		if (!!~this.dependencies.template.indexOf(dep)) {
			return;
		}
	}

	if (type == "template") {
		dep = getTemplatePath(dep);

		// template is already in templateToken, remove it from templateToken
		var i = this.dependencies.templateToken.indexOf(dep);
		if (!!~i) {
			this.dependencies.templateToken.splice(i, 1);
		}
	}

	if (type == "directiveToken") {
		dep = dep.replace(/-([a-z])/g, function (m) {
			return m[1].toUpperCase();
		});
	}


	if (!~this.dependencies[type].indexOf(dep)) {
		this.dependencies[type].push(dep);
	}
};

MetaData.prototype.addItem = function (type, item) {
	if (!this.items[type]) {
		throw new MetaDataError("item", type, item, this.path);
	}

	if (type == "template") {
		item = getTemplatePath(item);
	}

	if (!~this.items[type].indexOf(item)) {
		this.items[type].push(item);
	}
};

MetaData.prototype.isApp = function () {
	this.type.app = true;
	this.isRequired();
};
MetaData.prototype.isConfig = function () {
	this.type.config = true;
	this.isRequired();
};
MetaData.prototype.isRun = function () {
	this.type.run = true;
	this.isRequired();
};
MetaData.prototype.isRequired = function () {
	this.type.required = true;
};

MetaData.prototype.merge = function (src) {
	var that = this;

	Object.keys(this.dependencies).forEach(function (type) {
		src.dependencies[type].forEach(function (dep) {
			that.addDependency(type, dep);
		});
	});

	Object.keys(this.items).forEach(function (type) {
		src.items[type].forEach(function (item) {
			that.addItem(type, item);
		});
	});

	if (src.type.app) {
		this.isApp();
	}

	if (src.type.config) {
		this.isConfig();
	}

	if (src.type.run) {
		this.isRun();
	}

	if (src.type.required) {
		this.isRequired();
	}
};

module.exports = MetaData;

function getTemplatePath(p) {
	if (p[0] != ".") {
		if (p[0] != "/" && p[0] != "\\") {
			p = "/" + p;
		}
		p = "." + p;
	}
	return path.relative(cwd, p);
}