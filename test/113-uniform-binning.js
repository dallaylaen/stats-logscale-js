
const { expect } = require( 'chai' );

const { Univariate } = require ( '../index' );

describe( 'Univariate{ uniform: true }', () => {
    it( 'produces distribution without log', done => {
        const contract = distro => {
            expect( distro.getBins() ).to.deep.equal(
                [[10000, 1], [10001, 1], [10002, 1], [10003, 1], [10004, 1], [10005, 1], ] );
            expect( distro.min() ).to.equal( 9999.5 );
            expect( distro.max() ).to.equal( 10005.5 );
        }

        const uni = new Univariate({precision: 1, flat: true});
        uni.add( 10000, 10001, 10002, 10003, 10004, 10005);

        contract(uni);

        const clone = uni.clone();

        contract(clone);

        done();
    });

} );
