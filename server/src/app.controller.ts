import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'online',
      app: 'kickIt API',
      version: '1.0.0',
      message: 'Backend API server is up and running healthy! ⚽',
    };
  }
}
