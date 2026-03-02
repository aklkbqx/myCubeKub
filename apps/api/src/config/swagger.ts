import type { ElysiaSwaggerConfig } from '@elysiajs/swagger';

export const createSwaggerConfig = (
  projectName: string,
  serverUrl: string
): ElysiaSwaggerConfig => ({
  path: '/swagger',
  specPath: '/swagger/json',
  provider: 'scalar',
  excludeStaticFile: true,
  documentation: {
    info: {
      title: `${projectName} API`,
      version: '1.0.0',
      description: 'Unified API documentation',
    },
    servers: [{ url: serverUrl }],
    tags: [

    ],
    'x-tagGroups': [

    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        clientIdAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Client-Id',
          description: 'Required client id header',
        },
        clientSecretAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Client-Secret',
          description: 'Required client secret header',
        },
      },
    },
    security: [
      { clientIdAuth: [], clientSecretAuth: [] },
      { bearerAuth: [], clientIdAuth: [], clientSecretAuth: [] },
    ],
  } as any,
});
