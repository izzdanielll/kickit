import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from '../src/common/dto/pagination.dto';
import { MarketplaceService } from '../src/marketplace/marketplace.service';

async function main() {
  assert.ok((await validate(plainToInstance(PaginationDto, { page: '1001', limit: '50' }))).some((error) => error.property === 'page'));
  assert.ok((await validate(plainToInstance(PaginationDto, { page: '1', limit: '101' }))).some((error) => error.property === 'limit'));
  assert.equal((await validate(plainToInstance(PaginationDto, { page: '1000', limit: '100' }))).length, 0);

  const listings = new Map(Array.from({ length: 75 }, (_, index) => [`l${index}`, { id: `l${index}`, sellerId: 'user' }]));
  const service = new MarketplaceService({ isDbConnected: false, memStore: { listings } } as any);
  const page = await service.getMyListings('user', Object.assign(new PaginationDto(), { page: 2, limit: 50 }));
  assert.equal(page.length, 25, 'listing history must be bounded and paginated');
  console.log('Pagination bound tests passed');
}

void main();
