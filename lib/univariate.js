'use strict';

const { Binning } = require( './binning.js' );

const version = 'stats-logscale/univariate@1.0'; // semver w/o patch part

/**
 *  @classdesc Univariate statistical distribution analysis tool
 *  It works by sorting data into bins.
 *  This bin size depends on absolute & relative precision
 *  of the incoming data.
 *  Thus, very large samples can be processed fast
 *  with reasonable memory usage.
 */
class Univariate extends Binning {
    /**
     * @param {Object} args
     * @param {Number} [args.base]      Must be between 1 and 1.5. Default is 1.001
     * @param {Number} [args.precision] Must be positive. Default is 1E-9.
     * @param {Boolean} [args.flat]     If true, only use linear bins
     *                                  however large the stored values get.
     * @param {Array}  [args.bins]      See addWeighted() for description
     */
    constructor (args = {}) {
        super(args);
        this.storage = new Map(); // round(number) => count
        this._count = 0;
        this._cache = {};
        this.neat = new Neat(this);

        if (args.bins)
            this.addWeighted(args.bins);
    }

    /**
     * @desc Add value(s) to sample.
     * @param {...Number} data Number(s) to add to sample
     * @returns {Univariate} this (chainable)
     * @example
     * for (let i=0; i<10000; i++)
     *    stat.add(-Math.log(Math.random()));
     * // creates exponential distribution
     * @example
     * stat.add( 1,2,3,4,5,6 );
     * // a d6
     */
    add ( ...data ) {
        this._cache = {};
        data.forEach( x => {
            const bin = this.round(x);
            const count = this.storage.get(bin) ?? 0;
            this.storage.set(bin, count + 1);
            this._count++; // round() may throw, so increase counter one by one
        });
        return this;
    }

    /**
     * @desc Add values to sample, with weights.
     * @param {Array<[bin: Number, weight: number]>} pairs Array of (bin, weight) pairs
     * Negative quantity is allowed and means we're erasing data.
     * @returns {Univariate} this (chainable)
     * @example
     * stat.addWeighted( [ [0.1, 5], [0.2, 4], [0.3, 3] ] )
     * // adds 0.1 x 5, 0.2 x 4, 0.3 x 3
     */
    addWeighted ( pairs ) {
        this._cache = {};
        // TODO validate
        pairs.forEach( entry => {
            const x = entry[0];
            const n = Number.parseFloat( entry[1] ); // fractional weights possible
            if (Number.isNaN(n))
                throw new Error('Attempt to provide a non-numeric weight');

            const bin = this.round( x );

            const count = (this.storage.get(bin) ?? 0) + n;

            if (count <= 0) {
                this.storage.delete(bin);
                this._count += n - count;
            } else {
                this.storage.set(bin, count);
                this._count += n;
            }
        });
        return this;
    }

    /**
     *  @desc Serialization of the sample.
     *  @returns {Object}
     *  a plain object that can serve as an argument to new().
     */
    toJSON () {
        return {
            version,
            ...super.toJSON(),
            bins: this.getBins(),
        }
    }

    /**
     *   @desc create a copy of sample object, possibly modifying precision
     *   settings and/or filtering data.
     *   @param {Object} [args]
     *   @param {Boolean} [args.flat] Make the new distribution flat (no logarithmic bins)
     *   @param {Number} [args.precision] Override absolute precision
     *   @param {Number} [args.base] Override relative precision
     *   @param {Number} [args.min] Filter values less than this
     *   @param {Number} [args.max] Filter values greater than this
     *   @param {Number} [args.ltrim] Filter values less than Xth percentile
     *   @param {Number} [args.rtrim] Filter values greater than 100-Xth percentile
     *   @param {Boolean} [args.winsorize] If a data point doesn't fit the bounds,
     *       truncate it instead of discarding.
     *   @param {function(Number): Number} [args.transform] Apply function to sample data
     *   @returns {Univariate} copy of the original object
     */
    clone (args = {}) {
        // TODO better name?
        let bins = this.getBins(args);
        if (args.transform)
            bins = bins.map( x => [args.transform(x[0]), x[1]] );

        return new Univariate( {
            ...super.toJSON(),
            bins,
        } );
    }

    /**
     *   @desc  Returns a sorted list of pairs containing numbers in the sample
     *          and their respective counts.
     *          See addWeighted().
     *   @param {Object} [args]
     *   @param {Boolean} [args.flat] Make the new distribution flat (no logarithmic bins)
     *   @param {Number} [args.precision] Override absolute precision
     *   @param {Number} [args.base] Override relative precision
     *   @param {Number} [args.min] Filter values less than this
     *   @param {Number} [args.max] Filter values greater than this
     *   @param {Number} [args.ltrim] Filter values less than Xth percentile
     *   @param {Number} [args.rtrim] Filter values greater than 100-Xth percentile
     *   @param {Boolean} [args.winsorize] If a data point doesn't fit the bounds,
     *       truncate it instead of discarding.
     *   @returns {Array<[bin: Number, weight: number]>} Array of (bin, weight) pairs
     */
    getBins (args) {
        if (!this._cache.data) {
            this._cache.data = [...this.storage]
                .sort( (x, y) => x[0] - y[0] );
        }
        if (!args)
            return this._cache.data;

        const min = Math.max(
            args.min ?? -Infinity,
            this.percentile( args.ltrim ?? 0 ),
        );
        const max = Math.min(
            args.max ?? +Infinity,
            this.percentile( 100 - (args.rtrim ?? 0) ),
        );
        // TODO allow to skip buckets with too little data - param name???

        if (!args.winsorize)
            return this._cache.data.filter( x => x[0] >= min && x[0] <= max );

        const first = [this.round(min), 0];
        const last  = [this.round(max), 0];
        const out = [first];
        for (const [bin, count] of this._cache.data) {
            if (bin <= first[0])
                first[1] += count;
            else if (bin >= last[0])
                last[1] += count;
            else out.push([bin, count]);
        }
        if (last[1] > 0)
            out.push(last);
        return out;
    }

    /**
     *   @desc     Number of values in the sample.
     *   @returns   {Number} count
     */
    count () {
        return this._count;
    }

    /**
     *   @desc Minimal value in the sample.
     *          This value is somewhat rounded down to guarantee
     *          it is less than _any_ value in the sample.
     *   @returns {Number} Minimum value
     */
    min () {
        const data = this.getBins();
        return this.lower(data[0][0]);
    }

    /**
     *   @desc Maximal value in the sample.
     *          This value is somewhat rounded up to guarantee
     *          it is greater than _any_ value in the sample.
     *   @returns {Number} Maximum value
     */
    max () {
        const data = this.getBins();
        return this.upper(data[data.length - 1][0]);
    }

    /**
     *   @desc Sum of arbitrary function over the sample.
     *   @param {(arg: Number) => Number} fun function to integrate
     *   @returns {Number}
     *   @example
     *   stat.sumOf( x => 1 ); // same as stat.count()
     *   @example
     *   stat.sumOf( x => x ); // same as stat.count() * stat.mean()
     */
    sumOf (fun) {
        let s = 0;
        [...this.storage].forEach( entry => { s += entry[1] * fun(entry[0]) } );
        return s;
    }
    // TODO integralOf that takes bucket width into account

    /**
     *  @desc Calculate expected value of a given function over the sample.
     *  @param {function(Number): Number} fun
     *  @returns {Number}
     */
    E (fun) {
        return this._count ? this.sumOf( fun ) / this._count : undefined;
    }

    /**
     * @desc Average value of the sample.
     * @returns {Number}
     */
    mean () {
        return this._count ? this.sumOf( x => x ) / this._count : undefined;
    }

    /**
     * @desc Standard deviation of the sample.
     * Bessel's correction is used:
     * stdev = sqrt( E<(x - E<x>)**2> * n/(n-1) )
     * @returns {Number} Standard deviation
     */
    stdev () {
        // TODO better corrections?
        if (this._count < 2)
            return undefined;
        const mean = this.mean();
        return Math.sqrt( this.sumOf( x => (x - mean) * (x - mean) )
            / (this._count - 1) ); // Bessel's correction
    }

    /**
     *  @desc Skewness is a measure of the asymmetry of a distribution.
     *  Equals to 3rd standardized moment times n^2/(n-1)(n-2) correction
     *  Undefined if there are less than 3 data points.
     *  @returns {Number | undefined}
     */
    skewness () {
        const n = this.count();
        if (n < 3)
            return;
        const correction = n * n / ((n - 1) * (n - 2));
        return correction * this.momentStd(3);
    }

    /**
     *  @desc Kurtosis is a measure of how much of the distribution is
     *        contained in the "tails".
     *        Equals to 4th standardized moment minus 3,
     *        with a correction.
     *  @returns {Number | undefined}
     */
    kurtosis () {
        const n = this.count();
        if (n < 4)
            return;

        // taken from https://en.wikipedia.org/wiki/Kurtosis
        // not sure where it comes from
        // but if Excel is doing that, so do we.
        const corr1 = n * n * (n + 1) / ((n - 1) * (n - 2) * (n - 3));
        const corr2 = (n - 1) * (n - 1) / ((n - 2) * (n - 3));

        return this.momentStd(4) * corr1 - 3 * corr2;
    }

    /**
     *  @desc Moment of nth power, i.e. E((x-offset)**power)
     *  @param {Number} power Integer power to raise to.
     *  @param {Number} [offset] Number to subtract. Default is mean.
     *  @returns {Number}
     */
    moment (power, offset) {
        if (!Number.isInteger(power))
            throw new Error('Cannot calculate non-integer moment (did you mean momentAbs?)');
        if (offset === undefined)
            offset = this.mean();
        return this.E( x => (x - offset) ** power );
    }

    /**
     *  @desc Absolute moment of nth power, i.e. E(|x-offset|**power)
     *  @param {Number} power Power to raise to. May be fractional. Default is 1.
     *  @param {Number} [offset] Number to subtract. Default is mean.
     *  @returns {Number}
     */
    momentAbs (power = 1, offset) {
        if (offset === undefined)
            offset = this.mean();
        return this.E( x => Math.abs(x - offset) ** power );
    }

    /**
     *  @desc Standardized moment of nth power, i.e. nth moment / stdev**n.
     *  @param {Number} power Integer power to raise to
     *  @returns {Number}
     */
    momentStd (power) {
        return this.moment(power) / this.stdev() ** power;
    }

    /**
     *  @desc A number x such that P(value <= x) === p
     *  @param {Number} p from 0 to 1
     *  @return {Number} value
     *  @example
     *  const stat = new Univariate();
     *  stat.add( 1,2,3,4,5 );
     *  stat.quantile( 0.2 ); // slightly greater than 1
     *  stat.quantile( 0.5 ); // 3
     */
    quantile (p) {
        const target = p * this._count;

        const cumulative = this._cumulative();

        let l = 0;
        let r = cumulative.length;

        // console.log('target=' + target);

        while ( l + 1 < r ) {
            const m = Math.floor( (r + l) / 2 );
            // console.log( '['+l+', '+r+'): middle='+m+':', cumulative[m]);

            if (cumulative[m][1] >= target)
                r = m;
            else
                l = m;
        }

        const start = this.lower(cumulative[l][0]);
        const width = this.upper(cumulative[l][0]) - start;

        // Division by zero must not happen as zero-count buckets
        // should not exist.
        return start + width * (target - cumulative[l][1]) / (cumulative[l][2] - cumulative[l][1]);
    }

    /**
     *  @desc Returns x such that P(value < x) === p%.
     *        Same as quantile(p/100).
     *  @param {Number} p
     *  @returns {Number} x
     */
    percentile (p) {
        return this.quantile( p / 100 );
    }

    /**
     *  @desc Returns x such that half of the sample is less than x.
     *        Same as quantile(0.5).
     *  @returns {Number} x
     */
    median () {
        return this.quantile(0.5);
    }

    /**
     *  @desc Cumulative distribution function, i.e. P(value < x).
     *  This is the inverse of quantile.
     *  @param {Number} x
     *  @returns {Number} probability
     */
    cdf (x) {
        return this._rawCdf(x) / this._count;
    }

    _rawCdf (x) {
        const cumulative = this._cumulative();
        const lookup = this.round(x);

        // binary search
        // Look for the leftmost bucket >= round(x)
        // Count = total to the left of that bucket + maybe partial
        let l = 0;
        let r = cumulative.length;

        while (l < r) {
            const m = Math.floor((r + l) / 2);
            // console.log('['+l+', '+r+'): mid='+m+'; bin=', cumulative[m]);
            if (cumulative[m][0] < lookup)
                l = m + 1;
            else
                r = m;
        }

        // console.log('Looked for '+x+', found: ', [cumulative[l - 1], cumulative[l]] );

        if (l >= cumulative.length)
            return this._count;

        let partial = l > 0 ? cumulative[l - 1][2] : 0;

        if (lookup === cumulative[l][0]) {
            // we are within a bucket, so split it.
            // if width == 0 then by half, otherwise proportionally
            const width = this.upper(x) - this.lower(x);
            const total = cumulative[l][2] - cumulative[l][1];
            partial += width > 0
                ? total * (x - this.lower(x)) / width
                : total / 2;
        }

        return partial;
    }

    /**
     *   @desc Histogram based on the sample
     *   @param {Object} args
     *   @param {Number} [args.count] Number of bars in the histogram.
     *                                 Default is 10.
     *   @param {Number}  [args.scale] If given, make sure it's
     *   the height of the highest bar.
     *   @return {Array<[barHeight: Number, leftBorder: Number, rightBorder: Number]>}
     *   Array of triplets. rightBorder equals to the next bar's leftBorder.
     */
    histogram (args = {}) {
        // TODO options
        if (!this._count)
            return [];
        const min = this.min();
        const max = this.max();
        const count = args.count || 10;

        const hist = []; // [ count, lower, upper ], ...
        let edge = min;
        const step = (max - min) / count;
        for (let i = 0; i < count; i++)
            hist.push( [this._rawCdf(edge + step), edge, edge += step] );

        // Differenciate (must go backward!)
        for (let i = hist.length; i-- > 1; )
            hist[i][0] -= hist[i - 1][0];

        hist[0][0] -= this._rawCdf(min);

        if (args.scale) {
            // scale to a factor e.g. for drawing pictures
            let max = 0;
            for (let i = 0; i < hist.length; i++) {
                if (max < hist[i][0])
                    max = hist[i][0];
            }

            for (let i = 0; i < hist.length; i++)
                hist[i][0] = hist[i][0] * args.scale / max;
        }

        return hist;
    }

    _cumulative () {
        // integral of sorted bins
        // [ [ bin_center, sum_before, sum_after ], ... ]
        if (!this._cache.cumulative) {
            const data = this.getBins();
            const cumulative = [];
            let sum = 0;
            for (let i = 0; i < data.length; i++)
                cumulative.push( [data[i][0], sum, sum += data[i][1]] );

            this._cache.cumulative = cumulative;
        }
        return this._cache.cumulative;
    }
}

// Memoize! Replace methods with cached counterparts
// '+' at the end if method has arguments
[
    'cdf+',
    'kurtosis',
    'max',
    'mean',
    'min',
    'moment+',
    'momentAbs+',
    'momentStd+',
    'quantile+',
    'skewness',
    'stdev',
].forEach( method => {
    const hasArg = !!method.match(/\+/);
    if (hasArg)
        method = method.replace( '+', '' );
    const orig = Univariate.prototype[method];
    if (typeof orig !== 'function')
        throw new Error('method "' + method + '" is cached but never defined');
    Univariate.prototype[method] = hasArg
        ? function (...arg) {
            if (this._count === 0)
                return undefined;
            if (this._cache[method] === undefined)
                this._cache[method] = {};
            const key = arg.join(':');
            if (this._cache[method][key] === undefined)
                this._cache[method][key] = orig.apply( this, arg );
            return this._cache[method][key];
        }
        : function () {
            if (this._count === 0)
                return undefined;
            if (this._cache[method] === undefined)
                this._cache[method] = orig.apply( this );
            return this._cache[method];
        };
});

class Neat {
    constructor (main) {
        this._main = main;
    }

    min () {
        if (!this._main._count)
            return undefined;
        const data = this._main.getBins();
        return this._main.shorten(data[0][0]);
    }

    max () {
        if (!this._main._count)
            return undefined;
        const data = this._main.getBins();
        return this._main.shorten(data[data.length - 1][0]);
    }
}

[
    'E',
    'kurtosis',
    'mean',
    'median',
    'moment',
    'momentAbs',
    'momentStd',
    'percentile',
    'quantile',
    'skewness',
    'stdev',
    'sumOf',
].forEach( fun => {
    Neat.prototype[fun] = function (arg) {
        return this._main.shorten( this._main[fun](arg) );
    }
});

[
    'cdf',
    'count',
].forEach( fun => {
    Neat.prototype[fun] = function (arg) {
        return this._main[fun](arg);
    }
});

module.exports = { Univariate };
