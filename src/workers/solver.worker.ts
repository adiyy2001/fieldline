import { transferablesOf } from '../core/field3d/serialization';
import { handleSolverMessage } from './solver-handler';

addEventListener('message', (event: MessageEvent<unknown>) => {
  const response = handleSolverMessage(event.data, () => performance.now());
  postMessage(response, response.type === 'solved' ? transferablesOf(response.system) : []);
});
