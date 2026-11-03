import {makeProject} from '@motion-canvas/core';
import opening from './scenes/prime-intro?scene';
import decision from './scenes/decision-walkthrough?scene';
export default makeProject({scenes: [opening, decision]});
