/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./index.js":
/*!******************!*\
  !*** ./index.js ***!
  \******************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\n(() => {\n    const { Binning } = __webpack_require__(/*! ./lib/binning.js */ \"./lib/binning.js\");\n    const { Univariate } = __webpack_require__(/*! ./lib/univariate.js */ \"./lib/univariate.js\");\n\n    // TODO better name\n    // Must be short & reflect (math, statistics, logarithm)\n    const logstat = { Binning, Univariate };\n\n    if (typeof window !== 'undefined')\n        window.logstat = logstat;\n    else\n        module.exports = logstat;\n})();\n\n\n//# sourceURL=webpack://stats-logscale/./index.js?");

/***/ }),

/***/ "./lib/binning.js":
/*!************************!*\
  !*** ./lib/binning.js ***!
  \************************/
/***/ ((module) => {

eval("\n\nclass Binning {\n    constructor (args = {}) {\n        let base = args.base || 1.001;\n        let precision = args.precision || 1E-9;\n\n        // Make sure base ** (some int) === 2\n        if (!(base > 1) || !(base < 1.5))\n            throw new Error('base must be a number between 1 and 1.5');\n        base += 1e-9; // TODO explain - we must round-trip w/o getting \"eaten\"\n        base = 2 ** (1 / Math.ceil(Math.log(2) / Math.log(base)));\n        if (base === 1)\n            throw new Error('base too close to 1');\n\n        // Linear threshold. Inv: (base-1) * thresh === (minimal bin width) === precision!\n        precision = Number.parseFloat('' + precision); // make sure (de)serealization is ok\n        const equalBins = Math.ceil( 1 / (base - 1) );\n        const thresh = precision * equalBins; // recalc to minimize rounding errors\n\n        // TODO Make sure 1 is the center of a bin\n\n        this._thresh = thresh;\n        this._precision = precision;\n        this._base = base;\n    }\n\n    getBase () {\n        return this._base;\n    }\n\n    getPrecision () {\n        return this._precision;\n    }\n\n    // Rounding to nearest bin first, TODO linear split\n    round (x) {\n        if (typeof x !== 'number')\n            x = Number.parseFloat(x);\n        if (Number.isNaN( x ))\n            throw new Error('Attempt to round a non-numeric value: ' + x);\n        if (x < 0) return -this.round(-x);\n        if (x < this._thresh)\n            return Math.round( x / this._precision ) * this._precision;\n        else\n            return this._thresh * this._base ** Math.round( Math.log(x / this._thresh) / Math.log(this._base) );\n    }\n\n    upper (x) {\n        if (x < 0)\n            return -this.lower(-x);\n        x = this.round(x);\n        if (x < this._thresh)\n            return x + this._precision / 2;\n        return x * Math.sqrt(this._base);\n    }\n\n    lower (x) {\n        if (x < 0)\n            return -this.upper(-x);\n        x = this.round(x);\n        if (x <= this._thresh)\n            return x - this._precision / 2;\n        return x / Math.sqrt(this._base);\n    }\n\n    shorten (x, y) {\n        if (x === undefined)\n            return x;\n        return y === undefined\n            ? shorten(this.lower(x), this.upper(x))\n            : shorten(x, y);\n    }\n}\n\nfunction shorten (min, max, base = 10) {\n    // TODO validate, swap, diff sign, etc\n    if (min === max)\n        return min;\n    if (min * max <= 0)\n        return 0;\n    // min & max are of the same sign now\n    if (max < 0)\n        return -shorten(-max, -min, base);\n    if (min > max)\n        return  shorten( max, min, base);\n\n    // Assume scale := base ** power\n    // Pick the smallest power such that ceil(min * scale) <= floor(max * scale)\n    // (as in: min & max are separated)\n\n    let power = -Math.floor( Math.log(max - min) / Math.log(base) );\n    // base ** power should now distinguish max and min\n\n    // decrease scale while the separation holds\n    while (Math.ceil( min * base ** power ) <= Math.floor( max * base ** power ))\n        power--;\n    power++; // take 1 step back\n\n    // Try to avoid precision loss in negative **, positive seems ok\n    return power >= 0\n        ? Math.ceil( min * base **  power ) / base **  power\n        : Math.ceil( min / base ** -power ) * base ** -power;\n}\n\nmodule.exports = { Binning, shorten };\n\n\n//# sourceURL=webpack://stats-logscale/./lib/binning.js?");

/***/ }),

/***/ "./lib/univariate.js":
/*!***************************!*\
  !*** ./lib/univariate.js ***!
  \***************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\nconst { Binning } = __webpack_require__( /*! ./binning.js */ \"./lib/binning.js\" );\n\n/**\n *  @classdesc Univariate statistical distribution analysis tool\n *  It works by sorting data into bins.\n *  This bin size depends on absolute & relative precision\n *  of the incoming data.\n *  Thus, very large samples can be processed fast\n *  with reasonable memory usage.\n */\nclass Univariate extends Binning {\n    /**\n     * @param {Object} args\n     * @param {Number} args.base      Must be between 1 and 1.5. Default is 1.001\n     * @param {Number} args.precision Must be positive. Default is 1E-9.\n     * @param {Array}  args.bins      See addWeighted() for description\n     */\n    constructor (args = {}) {\n        super(args);\n        this.storage = {}; // str(bin) => [ count, num(bin) ]\n        this._count = 0;\n        this._cache = {};\n        this.neat = new Neat(this);\n\n        if (args.bins)\n            this.addWeighted(args.bins);\n    }\n\n    /**\n     * @desc Add value(s) to sample.\n     * @param {...Number} data Number(s) to add to sample\n     * @returns {Univariate} this (chainable)\n     * @example\n     * for (let i=0; i<10000; i++)\n     *    stat.add(-Math.log(Math.random()));\n     * // creates exponential distribution\n     * @example\n     * stat.add( 1,2,3,4,5,6 );\n     * // a d6\n     */\n    add ( ...data ) {\n        this._cache = {};\n        data.forEach( x => {\n            const bin = this.round(x);\n            if ( !this.storage[bin] )\n                this.storage[bin] = [0, bin];\n            this.storage[bin][0]++;\n            this._count++; // round() may throw, so increase counter one by one\n        });\n        return this;\n    }\n\n    /**\n     * @desc Add values to sample, with weights.\n     * @param {pair[]} pairs Each pair is an array of two numbers:\n     * [ value, quantity ]\n     * @returns {Univariate} this (chainable)\n     * @example\n     * stat.addWeighted( [ [0.1, 5], [0.2, 4], [0.3, 3] ] )\n     * // adds 0.1 x 5, 0.2 x 4, 0.3 x 3\n     */\n    addWeighted ( data ) {\n        this._cache = {};\n        // TODO validate\n        data.forEach( entry => {\n            const x = entry[0];\n            const n = Number.parseFloat( entry[1] ); // fractional weights possible\n            if (Number.isNaN(n))\n                throw new Error('Attempt to provide a non-numeric weight');\n\n            const bin = this.round( x );\n            if ( !this.storage[bin] )\n                this.storage[bin] = [0, bin];\n            this.storage[bin][0] += n;\n            this._count += n;\n        });\n        return this;\n    }\n\n    /**\n     *  @desc Serialization of the sample.\n     *  @returns {Object} plain data structure that can serve\n     *      as an argument to new().\n     */\n    toJSON () {\n        return {\n            precision: this.getPrecision(),\n            base:      this.getBase(),\n            bins:      this.getBins(),\n        }\n    }\n\n    /**\n     *   @desc create a copy of sample object, possibly modifying precision\n     *   settings and/or filtering data.\n     *   @param {Object} [args]\n     *   @param {Number} [args.precision] Override absolute precision\n     *   @param {Number} [args.base] Override relative precision\n     *   @param {Number} [args.min] Filter values less than this\n     *   @param {Number} [args.max] Filter values greater than this\n     *   @param {Number} [args.ltrim] Filter values less than Xth percentile\n     *   @param {Number} [args.rtrim] Filter values greater than 100-Xth percentile\n     *   @param {Function} [args.transform] Apply function to sample data\n     *   @returns {Univariate} copy of the original object\n     */\n    clone (args = {}) {\n        // TODO better name?\n        let bins = this.getBins(args);\n        if (args.transform)\n            bins = bins.map( x => [args.transform(x[0]), x[1]] );\n\n        return new Univariate( {\n            precision: args.precision ?? this.getPrecision(),\n            base:      args.base      ?? this.getBase(),\n            bins,\n        } );\n    }\n\n    /**\n     *  @desc  Returns a sorted list of pairs containing numbers in the sample\n     *          and their respective counts.\n     *          See addWeighted().\n     */\n    getBins (args) {\n        if (!this._cache.data) {\n            this._cache.data = Object.values( this.storage )\n                .map( bin => [bin[1], bin[0]] )\n                .sort( (x, y) => x[0] - y[0] );\n        }\n        if (!args)\n            return this._cache.data;\n\n        const min = Math.max(\n            args.min ?? -Infinity,\n            this.percentile( args.ltrim ?? 0 ),\n        );\n        const max = Math.min(\n            args.max ?? +Infinity,\n            this.percentile( 100 - (args.rtrim ?? 0) ),\n        );\n        // TODO allow to skip buckets with too little data - param name???\n        return this._cache.data.filter( x => x[0] >= min && x[0] <= max );\n    }\n\n    /**\n     *   @desc     Number of values in the sample.\n     *   @returns   {Integer} count\n     */\n    count () {\n        return this._count;\n    }\n\n    /**\n     *   @desc Minimal value in the sample.\n     *          This value is somewhat rounded down to guarantee\n     *          it is less than _any_ value in the sample.\n     *   @returns {Number} Minimum value\n     */\n    min () {\n        const data = this.getBins();\n        return this.lower(data[0][0]);\n    }\n\n    /**\n     *   @desc Maximal value in the sample.\n     *          This value is somewhat rounded up to guarantee\n     *          it is greater than _any_ value in the sample.\n     *   @returns {Number} Maximum value\n     */\n    max () {\n        const data = this.getBins();\n        return this.upper(data[data.length - 1][0]);\n    }\n\n    /**\n     *   @desc Sum of arbitrary function over the sample.\n     *   @param {Function} fun Number->Number\n     *   @returns {Number}\n     *   @example\n     *   stat.sumOf( x => 1 ); // same as stat.count()\n     *   @example\n     *   stat.sumOf( x => x ); // same as stat.count() * stat.mean()\n     */\n    sumOf (fun) {\n        let s = 0;\n        Object.values(this.storage).forEach( bin => { s += bin[0] * fun(bin[1]) } );\n        return s;\n    }\n    // TODO integralOf that takes bucket width into account\n\n    /**\n     *  @desc Calculate expected value of a given function over the sample.\n     *  @param {Function} fun Number->Number\n     *  @returns {Number}\n     */\n    E (fun) {\n        return this._count ? this.sumOf( fun ) / this._count : undefined;\n    }\n\n    /**\n     * @desc Average value of the sample.\n     * @returns {Number}\n     */\n    mean () {\n        return this._count ? this.sumOf( x => x ) / this._count : undefined;\n    }\n\n    /**\n     * @desc Standard deviation of the sample.\n     * Bessel's correction is used:\n     * stdev = sqrt( E<(x - E<x>)**2> * n/(n-1) )\n     * @returns {Number} Standard deviation\n     */\n    stdev () {\n        // TODO better corrections?\n        if (this._count < 2)\n            return undefined;\n        const mean = this.mean();\n        return Math.sqrt( this.sumOf( x => (x - mean) * (x - mean) )\n            / (this._count - 1) ); // Bessel's correction\n    }\n\n    /**\n     *  @desc Moment of nth power, i.e. E((x-offset)**power)\n     *  @param {Integer} power Power to raise to.\n     *  @param {Number} [offset] Number to subtract. Default is mean.\n     *  @returns {Number}\n     */\n    moment (power, offset) {\n        if (!Number.isInteger(power))\n            throw new Error('Cannot calculate non-integer moment (did you mean momentAbs?)');\n        if (offset === undefined)\n            offset = this.mean();\n        return this.E( x => (x - offset) ** power );\n    }\n\n    /**\n     *  @desc Absolute moment of nth power, i.e. E(|x-offset|**power)\n     *  @param {Number} power Power to raise to. May be fractional. Default is 1.\n     *  @param {Number} [offset] Number to subtract. Default is mean.\n     *  @returns {Number}\n     */\n    momentAbs (power = 1, offset) {\n        if (offset === undefined)\n            offset = this.mean();\n        return this.E( x => Math.abs(x - offset) ** power );\n    }\n\n    /**\n     *  @desc A number x such that P(value <= x) === p\n     *  @param {Number} p from 0 to 1\n     *  @return {Number} value\n     *  @example\n     *  const stat = new Univariate();\n     *  stat.add( 1,2,3,4,5 );\n     *  stat.quantile( 0.2 ); // slightly greater than 1\n     *  stat.quantile( 0.5 ); // 3\n     */\n    quantile (p) {\n        const target = p * this._count;\n\n        const cumulative = this._cumulative();\n\n        let l = 0;\n        let r = cumulative.length;\n\n        // console.log('target=' + target);\n\n        while ( l + 1 < r ) {\n            const m = Math.floor( (r + l) / 2 );\n            // console.log( '['+l+', '+r+'): middle='+m+':', cumulative[m]);\n\n            if (cumulative[m][1] >= target)\n                r = m;\n            else\n                l = m;\n        }\n\n        const start = this.lower(cumulative[l][0]);\n        const width = this.upper(cumulative[l][0]) - start;\n\n        // Division by zero must not happen as zero-count buckets\n        // should not exist.\n        return start + width * (target - cumulative[l][1]) / (cumulative[l][2] - cumulative[l][1]);\n    }\n\n    /**\n     *  @desc Returns x such that P(value < x) === p%.\n     *        Same as quantile(p/100).\n     *  @param {Number} p\n     *  @returns {Number} x\n     */\n    percentile (p) {\n        return this.quantile( p / 100 );\n    }\n\n    /**\n     *  @desc Returns x such that half of the sample is less than x.\n     *        Same as quantile(0.5).\n     *  @returns {Number} x\n     */\n    median () {\n        return this.quantile(0.5);\n    }\n\n    /**\n     *  @desc Cumulative distribution function, i.e. P(value < x).\n     *  This is the inverse of quantile.\n     *  @param {Number} x\n     *  @returns {Number} probability\n     */\n    cdf (x) {\n        return this.rawCdf(x) / this._count;\n    }\n\n    rawCdf (x) {\n        // do nothing if possible\n        if (!this._count || x <= this.min())\n            return 0;\n        if ( x >= this.max())\n            return this._count;\n\n        const cumulative = this._cumulative();\n        const lookup = this.round(x);\n\n        // binary search\n        // Look for the rightmost bucket <= round(x)\n        let l = 0;\n        let r = cumulative.length;\n\n        // console.log( 'target='+x );\n        while (l + 1 < r) {\n            const m = Math.floor((r + l) / 2);\n            // console.log('['+l+', '+r+'): mid='+m+'; bin=', cumulative[m]);\n            if (cumulative[m][0] <= lookup)\n                l = m;\n            else\n                r = m;\n        }\n\n        // console.log('Looked for '+x+', found: ', [cumulative[l - 1], cumulative[l]] );\n\n        // we fell between buckets - ok great\n        if (lookup > cumulative[l][0])\n            return cumulative[l][2];\n\n        // Sum of buckets prior to the one x is in\n        // plus the _part_ of bucket left of x\n        // divided by total count\n        return (\n            cumulative[l][1]\n                + (cumulative[l][2] - cumulative[l][1]) // x'th bucket total\n                    * (x - this.lower(x))               // part left of x\n                    / (this.upper(x) - this.lower(x))   // bucket width\n        );\n    }\n\n    /**\n     *   @desc Histogram based on the sample\n     *   @param {Object} args\n     *   @param {Integer} [args.count] Number of bars in the histogram.\n     *                                 Default is 10.\n     *   @param {Number}  [args.scale] If given, make sure it's\n     *   the height of the highest bar.\n     *   @return {Array}  Array of triplets: [barHeight, leftBorder, rightBorder ].\n     *   rightBorder equals to the next bar's leftBorder.\n     */\n    histogram (args = {}) {\n        // TODO options\n        if (!this._count)\n            return [];\n        const min = this.min();\n        const max = this.max();\n        const count = args.count || 10;\n\n        const hist = []; // [ count, lower, upper ], ...\n        let edge = min;\n        const step = (max - min) / count;\n        for (let i = 0; i < count; i++)\n            hist.push( [this.rawCdf(edge + step), edge, edge += step] );\n\n        // Differenciate (must go backward!)\n        for (let i = hist.length; i-- > 1; )\n            hist[i][0] -= hist[i - 1][0];\n\n        hist[0][0] -= this.rawCdf(min);\n\n        if (args.scale) {\n            // scale to a factor e.g. for drawing pictures\n            let max = 0;\n            for (let i = 0; i < hist.length; i++) {\n                if (max < hist[i][0])\n                    max = hist[i][0];\n            }\n\n            for (let i = 0; i < hist.length; i++)\n                hist[i][0] = hist[i][0] * args.scale / max;\n        }\n\n        return hist;\n    }\n\n    _cumulative () {\n        // integral of sorted bins\n        // [ [ bin_center, sum_before, sum_after ], ... ]\n        if (!this._cache.cumulative) {\n            const data = this.getBins();\n            const cumulative = [];\n            let sum = 0;\n            for (let i = 0; i < data.length; i++)\n                cumulative.push( [data[i][0], sum, sum += data[i][1]] );\n\n            this._cache.cumulative = cumulative;\n        }\n        return this._cache.cumulative;\n    }\n}\n\n[\n    'cdf+',\n    'max',\n    'mean',\n    'min',\n    'moment+',\n    'momentAbs+',\n    'quantile+',\n    'stdev',\n].forEach( method => {\n    const hasArg = !!method.match(/\\+/);\n    if (hasArg)\n        method = method.replace( '+', '' );\n    const orig = Univariate.prototype[method];\n    Univariate.prototype[method] = hasArg\n        ? function (...arg) {\n            if (this._count === 0)\n                return undefined;\n            if (this._cache[method] === undefined)\n                this._cache[method] = {};\n            const key = arg.join(':');\n            if (this._cache[method][key] === undefined)\n                this._cache[method][key] = orig.apply( this, arg );\n            return this._cache[method][key];\n        }\n        : function () {\n            if (this._count === 0)\n                return undefined;\n            if (this._cache[method] === undefined)\n                this._cache[method] = orig.apply( this );\n            return this._cache[method];\n        };\n});\n\nclass Neat {\n    constructor (main) {\n        this._main = main;\n    }\n\n    min () {\n        if (!this._main._count)\n            return undefined;\n        const data = this._main.getBins();\n        return this._main.shorten(data[0][0]);\n    }\n\n    max () {\n        if (!this._main._count)\n            return undefined;\n        const data = this._main.getBins();\n        return this._main.shorten(data[data.length - 1][0]);\n    }\n}\n\n[\n    'E',\n    'mean',\n    'median',\n    'moment',\n    'momentAbs',\n    'percentile',\n    'quantile',\n    'stdev',\n].forEach( fun => {\n    Neat.prototype[fun] = function (arg) {\n        return this._main.shorten( this._main[fun](arg) );\n    }\n});\n\n[\n    'cdf',\n    'count',\n].forEach( fun => {\n    Neat.prototype[fun] = function (arg) {\n        return this._main[fun](arg);\n    }\n});\n\nmodule.exports = { Univariate };\n\n\n//# sourceURL=webpack://stats-logscale/./lib/univariate.js?");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __webpack_require__("./index.js");
/******/ 	
/******/ })()
;