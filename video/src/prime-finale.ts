import {makeProject} from '@motion-canvas/core';
import domain from './prime-finale/domain?scene';
import title from './scenes/prime-counter-title?scene';
import test from './prime-finale/prime-test?scene';
import count from './prime-finale/prime-count?scene';
import results from './scenes/prime-counter-results?scene';
export default makeProject({scenes:[domain,title,test,count,results]});
