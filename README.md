# [gulp](http://gulpjs.com)-angular-builder

> Gulp plugin to filter and include only necessary AngularJS files.

---
## Wat?
* Share common libraries and Angular directives, services, templates, etc. across multiple projects
* Filter down to the minimal set of required files via the dependency tree

---
## Install
Install with [npm](https://npmjs.org/package/gulp-angular-builder)

```
npm install --save-dev gulp-angular-builder
```
---
Best used together with:
* [gulp-concat](https://www.npmjs.org/package/gulp-concat)
* [gulp-filter](https://www.npmjs.org/package/gulp-filter)
* [gulp-angular-templatecache](https://www.npmjs.org/package/gulp-angular-templatecache)
* [gulp-clone](https://www.npmjs.org/package/gulp-clone)

---
## Usage
```
var angularbuilder = require("gulp-angular-builder");
gulp.task("build-files", function () {
    return gulp.src([
        // All js, html (ejs), and json files to consider
        "./shared/**/*.+(js|html|json)",
        "./local/**/*.+(js|html|json)",
        "./index.html.ejs"
    ]).pipe(
        angularbuilder(seed, options)
    ).pipe(
        // Do other things!
    );
};
```
### angularbuilder(seed, options)
* **seed** (Array | String): File or files to start building dependency tree from.
* **options** (Object): Config object, detailed below.

---
## Options
Dependency Tree Building:
* **parseExclude** (Array<sup>1</sup> | String | RegExp): Files not parsed for dependencies (e.g. non-Angular library files).
* **requiredFiles** (Array<sup>1</sup> | String | RegExp): Files included *and* parsed, even if they are not directly depended on (e.g. files with only decorators in them). This is different from the *seed* input as that should be shared amongst multiple projects while this should not be.

Additional Files:
* **requiredLibs** (Array<sup>1</sup> | String | RegExp): Files included but *not* parsed for dependencies. Use this in conjunction with *parseExclude*.
* **optionalLibs** (Array<sup>1</sup> | String | RegExp): Optional library files that, if depended on, will also include all files matched by the *optionalLibsInclude*.
* **optionalLibsInclude** (String): Glob of files relative to the optional library file to be included if the optional library file is depended on.

Modules and Dependencies:
* **appModule** (String): Name of main Angular module. This will be used to create an `init.js` file in the stream which will contain `angular.module(appModule, [all required modules]);`.
* **globalModules** (Array | String): Modules to include in the `init.js` modules list that will not be found via the dependency tree building (e.g. modules in files from both *requiredLibs* and *parseExclude*).
* **globalDependencies** (Array | String): Dependencies that will be defined globally but will not be found via the dependency tree building (e.g. dependencies from modules in *globalModules*). Unfound dependencies will throw a gulp error otherwise.
* **filesWithResolvedDeps** (Array<sup>1</sup> | String | RegExp): Files that contain resolved dependencies (e.g. ui-bootstrap modal controllers).

Misc:
* **ignoredTemplates** (Array<sup>1</sup> | String | RegExp): Template strings to ignore looking for. 
* **filePriority** (Array | String): Files sorted to the top of the stream.

<sup>1</sup> Array of Strings or RegExps. Files are selected by partial matches.

---
## Notes
#### Automatically Required Files
* All parsed files containing `angular.module(...).run(...)` and `angular.module(...).config(...)` will be required and treated like a *seed* file.
* Parsed files that are depended on by a *seed* file will be required. This includes *services/factories/controllers/etc.*, *templates*, *filters*, and *animations*.

#### Enforced Conventions:
* Must use the `angular.module` for defining items
    * `angular.module(moduleName).item(itemName, function (dep1, dep2, dep3) { ... })`
    * `angular.module(moduleName).item(itemName, ["dep1", "dep2", "dep3", function (dep1, dep2, dep3) { ... })`
* Directives need to return an object, not a reference to an object
    * `return { templateUrl: "...", link: "..." };`
    * Not `var d = { templateUrl: "...", link: "..." }; return d;`

#### Misc:
* All dependencies beginning with $ will be ignored.
* Inline controllers within directives will be parsed if the controller function block is defined in the return object (i.e. not a reference to the controller).
* Anything that matches the pattern `"controller": "SomeCtrl"` will consider `SomeCtrl` to be a dependency. (Quotes can be single or double; object key does not require quotes.)
* All strings found in the file ending in *.html* or *.json* will be considered a template of that file (unless ignored via the *ignoredTemplates* option).

---
## Limitations
* Dynamically built template URLs will not be included (in both html partials and js files)
* No support (yet?) for $inject property

---
## Example

##### config.js
```
module.exports = {
    seed: [
        "./index.html.ejs"
    ],
    options: {
        parseExclude: [
            "/libs/",
            /\/libs-optional\/[^\/]+\/includes\//i
        ],
        requiredFiles: [],
        ignoredTemplates: [
            /assets/
        ],
        requiredLibs: [
            "/libs/"
        ],
        filePriority: [
            "jquery.js",
            "lodash.js",
            "angular.js"
        ],
        optionalLibs: [
            "/libs-optional/"
        ],
        optionalLibsInclude: "includes/*.js",
        globalDependencies: [
            "Restangular"
        ],
        appModule: "myAngularApp",
        globalModules: [
            "ngAnimate",
            "ui.router",
            "ui.bootstrap",
            "restangular"
        ],
        filesWithResolvedDeps: [
            /modal/i
        ]
    }
}
```

##### gulpfile.js
```
var gulp = require("gulp"),
    gutil = require("gulp-util"),
    gulpFilter = require("gulp-filter"),
    angularbuilder = require("gulp-angular-builder"),
    sourcemaps = require("gulp-sourcemaps"),
    concat = require("gulp-concat"),
    footer = require("gulp-footer"),
    ejs = require("gulp-ejs"),
    templateCache = require("gulp-angular-templatecache"),
    clone = require("gulp-clone"),
    uglify = require("gulp-uglify"),
    plumber = require("gulp-plumber"),
    watch = require("gulp-watch");

var config = require("./config.js");

gulp.task("default", function () {
    var angularTree = angularbuilder(config.seed, config.options);

    // Filters
    var indexTemplate = gulpFilter("**/index.html.ejs");
    var templates = gulpFilter([
        "**/*.html",
        "**/*.json"
    ]);

    var jsFilters = {
        libs: gulpFilter("**/+(libs|libs-optional)/**/*.js"),
        controllers: gulpFilter("**/*-controller.js"),
        directives: gulpFilter("**/*-directive.js"),
        services: gulpFilter([
            "**/*-service.js",
            "**/*-provider.js",
            "**/*-factory.js"
        ]),
        app: gulpFilter([
            "**/init.js", // init is from angularbuilder
            "**/+(app|routes|filters|animations|endpoints).js"
        ])
    };

    // Clone templates
    var templatesClone = clone.sink();

    // action starts here
    var stream = gulp.src([
        // All js and html files in shared or local
        "./+(shared|local)/*/**/*.+(js|html|json)",
        "./index.html.ejs"
    ]).pipe(plumber(config.errorHandler));

    // Build the Angular tree and filter out only files that are needed
    stream = stream.pipe(
        angularTree
    );

    // Build libs, controllers, directives, apps file
    Object.keys(jsFilters).forEach(function (item) {
        stream = stream.pipe(
            jsFilters[item]
        ).pipe(concat("target/js/" + item + (args.minify ? ".min" : "") + ".js", {
            newLine: "\n;\n"
        }))pipe(
            jsFilters[item].restore()
        );
    });

    // Build index.html
    stream = stream.pipe(
        indexTemplate
    ).pipe(ejs({
        min: ".min"
    }, {
        ext: ""
    })).pipe(
        indexTemplate.restore()
    );

    // Build templates file and copy all html
    stream = stream.pipe(
        templates
    ).pipe(
        templatesClone
    ).pipe(
        templateCache("target/js/templates.js", {
            module: "myAngularApp"
        })
    );
    stream = stream.pipe(
        templates.restore()
    ).pipe(
        templatesClone.tap()
    );

    // Write it out
    stream = stream.pipe(gulp.dest("./dist"));

    return stream;
});
```

##### shared/app/app.js (local/app/app.js can be similar)
This file is automatically included because of the `angular.module(...).run(...)`
```
angular.module("myAngularApp").run(["SomeService", "SomeLibrary", function (SomeService, SomeLibrary) {
    // SomeService will be looked for and included in services.js
    // SomeLibrary will be searched for and included in libs.js
});
```

##### shared/app/routes.js (local/app/routes.js can be similar)
This file is automatically included because of the `angular.module(...).config(...)`
```
angular.module("myAngularApp").config(["$stateProvider", "$urlRouterProvider",
    function ($stateProvider, $urlRouterProvider) {
        // UserCtrl, LoginCtrl, and ForbiddenCtrl will be looked for and included in controllers.js
        // The templates will also be looked for and included in the template cache file
        
        $stateProvider
            .state("user", {
                url: "/user/profile",
                templateUrl: "shared/app/user/user-partial.html",
                controller: "UserCtrl"
            });

        $stateProvider
            .state("login", {
                url: "/login?to",
                templateUrl: "shared/app/login/login-partial.html",
                controller: "LoginCtrl"
            });

        $stateProvider
            .state("forbidden", {
                url: "/forbidden?from",
                templateUrl: "shared/app/forbidden/forbidden-partial.html",
                controller: "ForbiddenCtrl"
            });
    }
]);
```

##### shared/libs-optional/myLib/lib.js (local/libs-optional/myLib/lib.js can be similar)
This file is included because of the `SomeLibrary` dependency in `shared/app/app.js`.
```
angular.module("myLib", []).service("SomeLibrary", function () {
    return window.someGlobalLibrary;
});
```

##### shared/libs-optional/myLib/includes/nonAngularLib.js
This file is included because `SomeLibrary` is required and this file is within the optional libs include folder.
```
var someNonAngularLib = function () {};
```