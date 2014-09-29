var MetaData = function (file, modules, definitions, dependencies, templates, filters, tokens, animations, config, run) {
	this.file = file;
	this.path = file.path;
	this.modules = modules || [];
	this.definitions = definitions || [];
	this.dependencies = dependencies || [];
	this.templates = templates || [];
	this.filters = filters || [];
	this.tokens = tokens || [];
	this.animations = animations || [];

	this.config = config || false;
	this.run = run || false;
};
MetaData.prototype.addModule = function (module) {
	if (!~this.modules.indexOf(module)) {
		this.modules.push(module);
	}
};
MetaData.prototype.addDefinition = function (definition) {
	if (!~this.definitions.indexOf(definition)) {
		this.definitions.push(definition);
	}
};
MetaData.prototype.addDependency = function (dependency) {
	if (dependency[0] == "$") {
		return;
	}
	if (~dependency.indexOf(" as ")) {
		dependency = dependency.split(" as ")[0];
	}
	dependency = dependency.replace("Provider", "");

	if (!~this.dependencies.indexOf(dependency)) {
		this.dependencies.push(dependency);
	}
};
MetaData.prototype.addTemplate = function (template) {
	if (!~this.templates.indexOf(template)) {
		this.templates.push(template);
	}
};
MetaData.prototype.addToken = function (token) {
	if (!~this.tokens.indexOf(token)) {
		this.tokens.push(token);
	}
};
MetaData.prototype.addFilter = function (filter) {
	if (!~this.filters.indexOf(filter)) {
		this.filters.push(filter);
	}
};
MetaData.prototype.addAnimation = function (animation) {
	if (!~this.animations.indexOf(animation)) {
		this.animations.push(animation);
	}
};
MetaData.prototype.isConfig = function () {
	this.config = true;
};
MetaData.prototype.isRun = function () {
	this.run = true;
};

MetaData.prototype.merge = function (src) {
	var that = this;
	var merge = function (items, fn) {
		items.forEach(function (item) {
			fn.call(that, item);
		});
	};

	merge(src.modules || [], this.addModule)
	merge(src.definitions || [], this.addDefinition);
	merge(src.dependencies || [], this.addDependency);
	merge(src.templates || [], this.addTemplate);
	merge(src.tokens || [], this.addToken);
	merge(src.filters || [], this.addFilter);
	merge(src.animations || [], this.addAnimation);

	if (src.config) {
		this.isConfig();
	}
	if (src.run) {
		this.isRun();
	}
};

module.exports = MetaData;