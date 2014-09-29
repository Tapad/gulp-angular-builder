var gutil = require("gulp-util"),
	esprima = require("esprima"),
	chalk = require("chalk"),
	htmlParser = require("./html-parser.js"),
	MetaData = require("./MetaData"),
	FakeFile = require("./FakeFile");

module.exports = function (file) {
	var content = file.contents.toString();

	var items = [];

	// Handle esprima output tree
	var processExpression = function (expression) {
		switch (expression.type) {
		case "Program":
		case "BlockStatement":
			expression.body.forEach(processExpression);
			break;
		case "ExpressionStatement":
			processExpression(expression.expression);
			break;
		case "FunctionExpression":
			processExpression(expression.body);
			break;

		case "CallExpression":
			processCall(expression);
			break;
		default:
			break;
		}
	};
	var processCall = function (expression) {
		if (expression.callee.type == "FunctionExpression") {
			processExpression(expression.callee);
			return;
		}
		if (!expression.callee.object) {
			return;
		}
		if (expression.callee.object.type == "Identifier") {
			if (expression.callee.object.name == "angular" && expression.callee.property.name == "module") {
				return expression.arguments[0].value;
			}
			return;
		}

		var module = processCall(expression.callee.object);
		if (module) {
			var item = expression.arguments[0].value || null;
			var type = expression.callee.property.name || null;
			var dependencies = [];
			var templates = [];
			var template;

			var i = 1;
			switch (type) {
			case "constant":
			case "value":
				// No dependencies
				break;

			case "config":
			case "run":
				i = 0;
			default:
				var injectedFunction;
				var parseInjection = function (expression) {
					switch (expression.type) {
					case "ArrayExpression":
						expression.elements.forEach(function (item) {
							if (item.type == "Literal") {
								dependencies.push(item.value);
							} else if (item.type == "FunctionExpression") {
								injectedFunction = item;
							}
						});
						break;
					case "FunctionExpression":
						expression.params.forEach(function (item) {
							dependencies.push(item.name);
						});
						injectedFunction = expression;
						break;
					}
				};
				parseInjection(expression.arguments[i]);

				// Need to get into the directive's return object and determine the controller's dependencies (if available) and template
				if (type == "directive") {
					injectedFunction.body.body.forEach(function (expression) {
						if (expression.type == "ReturnStatement") {
							if (expression.argument.type == "ObjectExpression") {
								expression.argument.properties.forEach(function (expression) {
									switch (expression.key.name) {
									case "template":
										if (expression.value.type == "Literal") {
											template = expression.value.value;
										}
										break;
									case "templateUrl":
										if (expression.value.type == "Literal") {
											templates.push(expression.value.value);
										}
										break;
									case "controller":
										parseInjection(expression.value);
										break;
									}
								});
							}
							return false;
						}
					});
				}
				break;
			}

			items.push({
				module: module,
				name: item,
				type: type,
				dependencies: dependencies,
				templates: templates,
				template: template
			});

			return module;
		}
	};
	try {
		processExpression(esprima.parse(content)); // Run it!
	} catch (e) {
		throw new gutil.PluginError("gulp-angular-builder", "Esprima Parsing Error\nFile: " + chalk.magenta(file.path) + "\nReason: " + chalk.red(e.description) + "\nLine: " + chalk.cyan(e.lineNumber) + "\nColumn: " + chalk.cyan(e.column));
	}

	content = content.replace(/(?:\/\*(?:[\s\S]*?)\*\/)|(?:([\s;])+\/\/(?:.*)$)/gm, ""); // Strip out comments

	// Look for raw template
	var template;
	template = content.match(/['"]?template['"]?:\s*?("(?:\\"|[^"])*"|'(?:\\'|[^'])*')/);
	if (template) {
		template = template[1].substr(1, template[1].length - 2);
		items.push({
			name: "-",
			type: null,
			dependencies: [],
			template: template
		});
	}

	// Look for additional templates
	var templates = [];
	var matches = content.match(/("[^"]+\.html?"|'[^']+\.html?'|"[^"]+\.json"|'[^']+\.json')/ig);
	if (matches) {
		matches.forEach(function (template) {
			if ((template[0] == '"' && template[template.length - 1] == '"') || (template[0] == "'" && template[template.length - 1] == "'")) {
				template = template.substr(1, template.length - 2);
				templates.push(template);
			}
		});
	}
	if (templates.length > 0) {
		items.push({
			name: null,
			type: null,
			dependencies: [],
			templates: templates
		});
	}

	// Look for additional controllers
	var controllers = [];
	var ctrlRegex = /['"]?controller['"]?:\s*?['"]([^'"]+?)['"]/g;
	while ((match = ctrlRegex.exec(content)) !== null) {
		controllers.push(match[1]);
	}
	if (controllers.length > 0) {
		items.push({
			name: null,
			type: null,
			dependencies: controllers
		});
	}

	// Look for filters
	var filters = [];
	var filterRegex = /\$filter\s*?\(\s*?['"](.*?)['"]\s*?\)/ig;
	var match;
	while ((match = filterRegex.exec(content)) !== null) {
		filters.push(match[1]);
	}
	if (filters.length > 0) {
		items.push({
			name: null,
			type: null,
			dependencies: [],
			filters: filters
		});
	}

	// Create metadata
	var out = new MetaData(file);
	items.forEach(function (item) {
		out.addDefinition(item.name);
		if (item.module) {
			out.addModule(item.module);
		}
		if (item.dependencies) {
			item.dependencies.forEach(function (dependency) {
				out.addDependency(dependency);
			});
		}
		if (item.templates) {
			item.templates.forEach(function (template) {
				out.addTemplate(template);
			});
		}
		if (item.template) {
			out.merge(
				htmlParser(
					new FakeFile(file.path + ": " + item.name + " Internal Template", item.template)
				)
			);
		}
		if (item.filters) {
			item.filters.forEach(function (filter) {
				out.addFilter(filter);
			});
		}
		if (item.type == "config") {
			out.isConfig();
		}
		if (item.type == "run") {
			out.isRun();
		}
	});

	return out;
};