var htmlparser = require("htmlparser2"),
	MetaData = require("../MetaData");

module.exports = function (contents, metadata) {
	metadata = metadata || new MetaData();
	parseContent(contents, metadata);
	return metadata;
};

function parseContent(contents, metadata) {
	var isApp = false,
		component = [],
		template = [],
		directiveToken = [],
		animationToken = [],
		filter = [];

	// Get interpolation filters
	var interpolationRegex = /\{\{\s*?(.*?)\s*?\}\}/g,
		filterRegex = /(?:^|\()\s*\w+?\s*\|\s*(\w+?)\s*(?:\)|(?=\|)|$)/,
		expression;

	while ((expression = interpolationRegex.exec(contents)) !== null) {
		expression = expression[1];
		while (expression.match(filterRegex) !== null) {
			expression = expression.replace(filterRegex, function (match, f) {
				filter.push(f);
				return "expression";
			});
		}
	}

	// Get everything else
	var parser = new htmlparser.Parser({
		onopentag: function (name, attributes) {
			// Add directive token
			directiveToken.push(name);

			if (name == "ng-include") {
				// Add template
				template.push(attributes["src"]);
			}

			Object.keys(attributes).forEach(function (attr) {
				if (attr == "ng-app") {
					isApp = true;
				} else if (attr == "ng-include") {
					// Add template
					template.push(attributes[attr]);
				} else if (attr == "ng-controller") {
					// Add controller
					component.push(attributes[attr]);
				} else if (attr == "class" || attr == "ng-class") {
					// Add animation tokens (all the class names)
					var classes;
					if (attr == "ng-class") {
						classes = [];
						attributes[attr].split(",").forEach(function (item) {
							classes.push(item.split(":")[0].replace(/[\{\}'"\s]/g, ""));
						});
					} else {
						classes = attributes[attr].split(/\s+/g);
					}
					classes.forEach(function (item) {
						animationToken.push("." + item);
					});
				} else {
					// Add directive tokens
					directiveToken.push(attr.replace(/^data-/i, ''));

               // Look for filters
               var attrValue = attributes[attr].replace(/\s+/g, " ");
               var filters = attrValue.split("|").map(function (filterExpression) {
                  return filterExpression.trim().replace(/:.*/, "");
               }).splice(1); // First element is empty

               // Add filters
               Array.prototype.push.apply(filter, filters);
            }
			});
		}
	});
	parser.write(contents);
	parser.done();

	// ng-include should be strings, pull out the actual paths
	template = template.map(function (template) {
		if (template[0] == "'" || template[0] == '"') {
			return template.substr(1, template.length - 2);
		}
		return null;
	}).filter(function (_) {
		return _;
	});

	component.forEach(function (dep) {
		metadata.addDependency("component", dep);
	});
	filter.forEach(function (dep) {
		metadata.addDependency("filter", dep);
	});
	template.forEach(function (dep) {
		metadata.addDependency("template", dep);
	});
	directiveToken.forEach(function (dep) {
		metadata.addDependency("directiveToken", dep);
	});
	animationToken.forEach(function (dep) {
		metadata.addDependency("animationToken", dep);
	});

	if (isApp) {
		metadata.isApp();
	}

	return metadata;
}
