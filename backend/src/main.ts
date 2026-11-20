import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  try { process.loadEnvFile(); } catch { /* .env is optional outside local development */ }
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: false, transform: true }));
  app.useGlobalFilters({
    catch(exception: any, host: any) {
      const response = host.switchToHttp().getResponse();
      const status = exception?.getStatus?.() ?? (exception instanceof BadRequestException ? 400 : 500);
      response.status(status).json({ statusCode: status, message: exception?.message ?? 'Internal server error' });
    },
  } as any);
  await app.listen(3000, '0.0.0.0');
  console.log('Party Casino API listening on http://localhost:3000');
}
bootstrap();
