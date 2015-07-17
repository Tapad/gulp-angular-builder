var esprima = require("esprima"),
	walk = require("esprima-walk").walkAddParent,
	MetaData = require("../MetaData"),
	EsprimaError = require("../errors").EsprimaError;

module.exports = function (contents, metadata) {
	metadata = metadata || new MetaData();

	parseContent(contents, metadata);

	metadata.parsed = true;

	return metadata;
};

function parseContent(contents, metadata) {
	var tree;
	try {
		tree = esprima.parse(contents, {
			comment: true
		});
		walk(tree, function (node) {
			walkTree(node, metadata);
		});
		if (tree.comments) {
			tree.comments.forEach(function (comment) {
				processComment(comment, metadata);
			});
		}
	} catch (e) {
		throw new EsprimaError(e, metadata.path);
	}
}

/**
 * Parsing magic
 */
function walkTree(node, metadata) {
	handleModuleDefinition(node, metadata);
	handleInjectionInjectNotation(node, metadata);

	handleTemplateUrl(node, metadata);
	handleTemplateTokens(node, metadata);

	handleControllerAssignment(node, metadata);
	handleControllerProperty(node, metadata);

	handleResolve(node, metadata);

	handleDecorator(node, metadata);
}

function handleModuleDefinition(node, metadata) {
	// angular.module([module]).[componentType]([componentName], ...args)
	if (node.name != "angular") {
		return;
	}

	var seq = ["Identifier", "MemberExpression", "CallExpression", "MemberExpression"];

	var target = node,
		matches = true;

	seq.forEach(function (type) {
		if (target.type != type) {
			matches = false;
			return false;
		}
		target = target.parent;
	});

	if (!matches || target.type != "CallExpression" || node.parent.property.name != "module") {
		return;
	}

	var module = node.parent.parent.arguments[0].value;
	metadata.addModule(module);

	handleComponentDefinition(target, metadata);

	// Support chaining
	while (target.parent && target.parent.type == "MemberExpression" && target.parent.parent && target.parent.parent.type == "CallExpression") {
		target = target.parent.parent;
		handleComponentDefinition(target, metadata);
	}
}

function handleComponentDefinition(node, metadata) {
	var componentType = node.callee.property.name,
		componentName,
		componentExpression;

	switch (componentType) {
		case "run":
			componentExpression = node.arguments[0];

			metadata.isRun();
			break;
		case "config":
			componentExpression = node.arguments[0];

			metadata.isConfig();
			break;
		default:
			componentName = node.arguments[0].value;
			componentExpression = node.arguments[1];
			metadata.addItem(componentType, componentName);
			break;
	}

	// Arrays provided to $provide's constant and value methods are not injectables
	// therefore they do not specify dependencies.
	if (componentType !== "constant" && componentType !== "value") {
		handleInjection(componentExpression, metadata);
	}
}

function handleInjection(node, metadata) {
	switch (node.type) {
		case "FunctionExpression":
			handleInjectionFunctionNotation(node, metadata);
			break;
		case "ArrayExpression":
			handleInjectionArrayNotation(node, metadata);
			break;
	}
}

function handleInjectionFunctionNotation(node, metadata) {
	// function (...params)
	node.params.forEach(function (param) {
		metadata.addDependency("component", param.name);
	});
}

function handleInjectionArrayNotation(node, metadata) {
	// [...params, fn]
	node.elements.forEach(function (item) {
		if (item.type != "Literal") {
			return;
		}
		metadata.addDependency("component", item.value);
	});
}

function handleInjectionInjectNotation(node, metadata) {
	// fn.$inject = [...params]
	if (node.name != "$inject" || node.type != "Identifier" || !node.parent || node.parent.type != "MemberExpression" || !node.parent.parent || node.parent.parent.type != "AssignmentExpression" || !node.parent.parent.right || node.parent.parent.right.type != "ArrayExpression") {
		return;
	}

	handleInjectionArrayNotation(node.parent.parent.right, metadata);
}

function handleTemplateUrl(node, metadata) {
	// { templateUrl: [string] }
	if (node.name != "templateUrl" || node.type != "Literal" || !node.parent || node.parent.type != "Property") {
		return;
	}

	metadata.addDependency("template", node.parent.value.value);
}

function handleTemplateTokens(node, metadata) {
	if (node.type != "Literal") {
		return;
	}

	var value = node.value;

	// TODO: put this in config or something
	if (!/\.(html?|json|svg)$/i.test(value) || /^(https?:)?\/\//i.test(value)) {
		return;
	}

	metadata.addDependency("templateToken", value);
}

function handleControllerAssignment(node, metadata) {
	// a.controller = [string]
	if (node.name != "controller" || !node.parent || node.parent.type != "MemberExpression" || node.parent.property != node || !node.parent.parent || node.parent.parent.type != "AssignmentExpression" || !node.parent.parent.right) {
		return;
	}

	var target = node.parent.parent.right;

	if (target.type == "Literal") {
		metadata.addDependency("component", target.value);
		return;
	}

	handleInjection(target, metadata);
}

function handleControllerProperty(node, metadata) {
	// { controller: [string] }
	if (node.name != "controller" || !node.parent || node.parent.type != "Property") {
		return;
	}

	var target = node.parent.value;

	if (target.type == "Literal") {
		metadata.addDependency("component", target.value);
		return;
	}

	handleInjection(target, metadata);
}

function handleResolve(node, metadata) {
	if (node.name != "resolve" || !node.parent) {
		return;
	}

	var target, controller;
	if (node.parent.type == "MemberExpression" && node.parent.parent && node.parent.parent.type == "AssignmentExpression" && node.parent.parent.right.type == "ObjectExpression") {
		// a.resolve = { ... }
		target = node.parent.parent.right;

		// Find closest controller
		var objName = node.parent.object.name;

		var block = node;
		while (block.type != "BlockStatement" && (block = block.parent)) {};
		if (block.type == "BlockStatement") {
			block.body.forEach(function (statement) {
				if (!statement.expression || statement.expression.type != "AssignmentExpression" || statement.expression.left.type != "MemberExpression" || statement.expression.left.object.name != objName || statement.expression.left.property.name != "controller" || statement.expression.right.type != "Literal") {
					return;
				}

				controller = statement.expression.right.value;
				return false;
			});
		}
	} else if (node.parent.type == "Property" && node.parent.value.type == "ObjectExpression") {
		// { resolve: { ... }}
		target = node.parent.value;

		// Find closest controller
		var obj = node.parent.parent;
		obj.properties.forEach(function (property) {
			if (property.key.name != "controller" || property.value.type != "Literal") {
				return;
			}

			controller = property.value.value;
			return false;
		});
	} else {
		return;
	}

	target.properties.forEach(function (property) {
		if (controller) {
			metadata.addResolve(controller, property.key.name);
		}
		metadata.addResolve(null, property.key.name);

		handleInjection(property.value, metadata);
	});
}

function handleDecorator(node, metadata) {
	// $provide.decorator([component], [...])
	if (node.name != "decorator" || !node.parent || !node.parent.object || node.parent.object.name != "$provide" || !node.parent.parent || node.parent.parent.type != "CallExpression") {
		return;
	}

	metadata.addDependency("component", node.parent.parent.arguments[0].value);

	handleInjection(node.parent.parent.arguments[1], metadata);
}


/**
 * Process comments
 */
function processComment(comment, metadata) {
	handleResolveComments(comment, metadata);
}

function handleResolveComments(comment, metadata) {
	if (comment.type != "Block" || comment.value.trim().indexOf("resolve") != 0) {
		return;
	}
	var resolves = comment.value.trim().split(/\s*\,?\s+/g);

	if (resolves[0] != "resolve" && resolves[0] != "resolves") {
		return;
	}

	resolves.slice(1).forEach(function (resolve) {
		metadata.addResolve(null, resolve);
	});
}
