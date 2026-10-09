const assert=require('node:assert/strict');
const {countObjects}=require('../public/counter-worker.js');
function scene(background,object){const width=400,height=300,rgba=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++)rgba.set([background,background,background,255],i*4);for(let row=0;row<3;row++)for(let col=0;col<4;col++)for(let y=30+row*85;y<65+row*85;y++)for(let x=30+col*95;x<65+col*95;x++)rgba.set([object,object,object,255],(y*width+x)*4);return{rgba,width,height};}
assert.equal(countObjects(scene(255,40)).boxes.length,12,'Twelve distinct dark objects');
assert.equal(countObjects(scene(10,240)).boxes.length,12,'Twelve distinct light objects');
assert.equal(countObjects({...scene(255,40),roi:{x:15,y:15,w:170,h:145}}).boxes.length,4,'ROI must exclude all other objects');
const blank=scene(255,255);assert.equal(countObjects(blank).boxes.length,0,'Do not invent a count on a blank image');
assert.equal(countObjects({...scene(255,40),mode:'edges'}).boxes.length,12,'External edges do not count the interior twice');
assert.equal(countObjects({...scene(255,40),minArea:.05}).boxes.length,0,'Small details can be filtered out');
console.log('6 meaningful object-counting checks passed.');
