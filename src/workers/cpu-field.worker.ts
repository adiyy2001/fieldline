import { handleFieldMessage } from './cpu-field-handler';

addEventListener('message', (event: MessageEvent<unknown>) => {
  const result = handleFieldMessage(event.data);
  postMessage(result, result.type === 'range-evaluated' ? [result.values.buffer] : []);
});
