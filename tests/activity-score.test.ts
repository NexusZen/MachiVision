import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityScore,peakActivity} from '../lib/activity-score';
test('activity score is a fixed 0–100 percentage without novelty or per-clip scaling',()=>{
 assert.equal(activityScore(0,1024),0);
 assert.equal(activityScore(256,1024),25);
 assert.equal(activityScore(1024,1024),100);
 assert.equal(activityScore(2000,1024),100);
 assert.equal(activityScore(-1,1024),0);
 assert.equal(activityScore(1,0),0);
 assert.equal(activityScore(NaN,1024),0);
 assert.equal(peakActivity([]),null);
});
