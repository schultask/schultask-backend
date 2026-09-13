// Kept in its own file (not storage.module.ts) so storage.service.ts can
// import the token without a module<->service circular import — that cycle
// previously caused @Inject(MINIO_CLIENT) to capture `undefined` at
// decoration time (storage.module.ts required storage.service.ts, which
// required storage.module.ts back, before MINIO_CLIENT was assigned).
export const MINIO_CLIENT = 'MINIO_CLIENT';
