/** Reject values JSON would silently alter, omit, or fail to serialize. */
export function assertJsonValue(value: unknown, label: string): void {
  const ancestors = new Set<object>();
  function visit(item: unknown, path: string): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || item === null) throw new Error(`${path} must be JSON-serializable`);
    if (ancestors.has(item)) throw new Error(`${path} contains a circular reference`);
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new Error(`${path} must be a plain JSON object`);
    }
    if (Object.getOwnPropertySymbols(item).length) throw new Error(`${path} contains symbol properties`);
    ancestors.add(item);
    if (Array.isArray(item)) {
      const keys = Object.getOwnPropertyNames(item);
      if (keys.length !== item.length + 1) throw new Error(`${path} must be a dense JSON array without extra properties`);
      for (let index = 0; index < item.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error(`${path}[${index}] must be a JSON data property`);
        visit(descriptor.value, `${path}[${index}]`);
      }
    } else {
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
        if (!descriptor.enumerable || !('value' in descriptor)) throw new Error(`${path}.${key} must be a JSON data property`);
        visit(descriptor.value, `${path}.${key}`);
      }
    }
    ancestors.delete(item);
  }
  visit(value, label);
}
