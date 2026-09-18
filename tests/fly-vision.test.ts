import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flyVision} from '../lib/fly-vision';
test('interpretation is deterministic and highlights temporal change without mutating video pixels',()=>{
 const black=new Uint8ClampedArray(4*4*4),white=new Uint8ClampedArray(black.length).fill(255),copy=white.slice();
 const still=flyVision(white,white,4,4),change=flyVision(white,black,4,4);
 assert.ok(change[1]>still[1]);assert.deepEqual(white,copy);
 assert.deepEqual(flyVision(white,black,4,4),change);
 assert.equal(change[3],255);assert.equal(flyVision(black,null,4,4)[1],0);
});
