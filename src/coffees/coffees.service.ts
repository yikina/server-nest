import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Coffee } from './entities/coffee.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateCoffeeDto } from './dto/create-coffee.dto/create-coffee.dto';
import { UpdataCoffeeDto } from './dto/create-coffee.dto/update-coffee.dto';
import { Flavor } from './entities/flavor.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto/pagination-query.dto';
import { Event } from 'src/events/entities/event.entity/event.entity';

@Injectable()
export class CoffeesService {
    //连接真实数据库
    constructor(
        @InjectRepository(Coffee)
        private readonly coffeeRepository:Repository<Coffee>,
        @InjectRepository(Flavor)
        private readonly flavorRepository:Repository<Flavor>,
        private readonly datasource:DataSource,
    ){}

    findAll(paginationQuery:PaginationQueryDto){
        const{offset,limit}=paginationQuery;
        return this.coffeeRepository.find({
            relations:['flavors'],
            skip:offset,
            take:limit,
        })
    }
    
    async findOne(id:string){
        const coffee = await this.coffeeRepository.findOne({
            where: { id: +id },
            relations: ['flavors'],
          })
        if(!coffee){
            throw new HttpException(`coffee ${id} not found`,404)
        }
        return coffee;
    }

   async create(createCoffeeDto:CreateCoffeeDto){
        const flavors=await Promise.all(
        createCoffeeDto.flavors.map(name=>this.preloadFlavorByName(name)),
        )
        const coffee=this.coffeeRepository.create({
            ...createCoffeeDto,
            flavors
        })
        return this.coffeeRepository.save(coffee)
    }

    async update(id:string,updatecoffeeDto:UpdataCoffeeDto){
        const flavors=updatecoffeeDto.flavors &&(await Promise.all(
            updatecoffeeDto.flavors.map(name=>this.preloadFlavorByName(name))
        ))
       const coffee=await this.coffeeRepository.preload({
        id:+id,
        ...updatecoffeeDto,
        flavors
       })
       if(!coffee){
        throw new NotFoundException(`coffee ${id} not found`)
       }
       return this.coffeeRepository.save(coffee);
    }

    async remove(id:string){
        const coffee=await this.findOne(id);
        return this.coffeeRepository.remove(coffee)
       
    }
//使用transaction
    async recommendCoffee(coffee:Coffee){
        const queryRunner=this.datasource.createQueryRunner();

        await queryRunner.connect();
        await queryRunner.startTransaction();

        try{
            coffee.recommendations++;

            const recommendEvent=new Event();
            recommendEvent.name='recommend_coffee';
            recommendEvent.type='coffee';
            recommendEvent.payload={coffeeId:coffee.id}


        }catch(err){
            await queryRunner.rollbackTransaction()
        }finally{
            await queryRunner.release()
        }
    }

    private async preloadFlavorByName(name:string):Promise<Flavor>{
        const existFlavor= await this.flavorRepository.findOneBy(
            {name:name});
        if(existFlavor){
            return existFlavor
        }
        return this.flavorRepository.create({name})
    }
}
