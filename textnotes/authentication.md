# authentication

快速创建Controller、Service、Module、DTO文件命令

```
nest g resource user
```

## 用户注册

用户注册时的密码如果直接存储明文到数据库中会有安全问题，这里我们使用bcryptjs进行加密，把加密后的用户密码再存储到数据库中。

bcryptjs是一个用于密码散列化的JavaScript库。它使用bcrypt算法对密码进行散列，从而增强密码的安全性，减少被破解的风险。bcrypt算法使用salt值来增强密码的安全性，salt值随机生成并和密码一起进行散列，这使得破解的难度大大增加。

bcryptjs库使用简单，它提供了两个主要的函数：genSalt和hash。通过genSalt函数生成一个salt值，然后使用hash函数将密码和salt值一起进行散列。bcryptjs还提供了一个compare函数，可以用于检查给定的密码和散列后的密码是否匹配。

安装：

```
pnpm install bcryptjs
```

常用方法：

```js
/*处理加密
bcryptjs.hashSync(data,salt)
-data 要加密的数据
-salt 使用哈希加密的salt，若指定为数字，则将指定的轮数生成盐并使用
*/
const hashpass=bcryptjs.hashSync(pass,10)

/*校验数据
bcryptjs.compareSync(data,encrypted)
-data 要进行比较的数据，登录后前端传递过来的数据
-encrypted 数据库中查询出来的加密后的密码
*/
const ispass=bcryptjs.compareSync(pass，encryptPass)
```

我们使用auth users两个module来管理用户登录注册逻辑，其中auth进行接口跳转处理，user进行具体逻辑处理

接下来进行entity和dto的处理：

### user entity

```tsx
import { BeforeInsert, Column,Entity, PrimaryGeneratedColumn } from "typeorm";
import * as bcrypt from 'bcryptjs';

@Entity('user')
export class User{
    @PrimaryGeneratedColumn('uuid')  //使用uuid为每一位用户生成独立唯一的id
    id:number;

    @Column({length:100})
    username:string;

    @Column({length:100})
    password:string;

    @Column({default:null})
    avatar:string;

    @BeforeInsert()
    async hashPassword(){
        if(!this.password) return
        //加密密码
        this.password=await bcrypt.hashSync(this.password,10)
    }
}
```

### dto

- create-user.dto

  ```ts
  import { IsNotEmpty } from "class-validator";
  
  export class CreateUserDto {
     @IsNotEmpty({message:"请输入用户名"})
     username:string;
  
     @IsNotEmpty({message:"请输入密码"})
     password:string;
  }
  
  ```

  update-user.dto继承即可，user-info按照其他信息填充

### user.services

```ts
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  //注册
  async register(createUser: CreateUserDto) {
    const { username } = createUser;

    const existUser = await this.userRepository.findOne({
      where: { username },
    });
    if(existUser){
        throw new HttpException("用户名已存在", HttpStatus.BAD_REQUEST)
    }

    const newUser = await this.userRepository.create(createUser)
    return await this.userRepository.save(newUser);
  }
}
```

### user.controller

```ts
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
    register(@Body() createUser: CreateUserDto) {
      return this.userService.register(createUser);
    }
}
```

### user.module

别忘记在module中添加：

```ts
@Module({
  imports:[TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService]
})
export class UserModule {}
```



### 密码不返回前端

使用post方法创建用户成功后，会返回相应创建成功的信息，为了安全性，后端在返回这些信息中不应包含密码，可以在返回数据的时候处理，不返回密码给前端：

1. 在user.entity给密码加上装饰器@Exclude

   ```ts
    @Exclude() //排除密码字段
       @Column({length:100})
       password:string;
   ```

2. 在user.controller中接口方法处加上拦截器

   ```ts
    @UseInterceptors(ClassSerializerInterceptor)
     @Post('register')
       register(@Body() createUser: CreateUserDto) {
         return this.userService.register(createUser);
       }
   ```

   这样在返回的字段中就不会包含密码啦~

通过postcode测试user/register通过json输入test123，可以看到测试成功

## 用户登录

用户注册与用户登录流程差异不大，只不过多了一个使用jwt验证的流程

JWT是指JSON Web Token，是一种用于在网络应用之间传递信息的安全标准。它是一种基于JSON的开放标准（RFC 7519），用于在不同实体之间安全地传输信息。

JWT由三部分组成：头部（Header）、载荷（Payload）和签名（Signature）。头部包含了令牌的类型和所使用的算法，载荷包含了需要传输的信息，签名用于验证数据的完整性。

JWT的工作流程如下：

1. 用户进行身份认证后，服务器生成一个JWT，并将其返回给用户。
2. 用户在之后的请求中将JWT作为身份验证的方式，放在请求的头部、查询字符串或请求体中。
3. 服务器接收到请求后，解析JWT并验证其有效性和完整性。
4. 如果验证成功，服务器会根据JWT中的信息进行相应操作。

使用JWT的好处包括：

- 无需在服务器端存储会话信息，减轻服务器的存储压力。
- 客户端可以将JWT保存在本地，减少了对服务器的频繁请求。
- JWT使用数字签名进行验证，可以确保数据的完整性和安全性。

需要注意的是，JWT中的信息是可以被解码的，但是不能被修改，因为由签名保证了数据的完整性。

### user.service

```ts
Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService //引入JwtService
  ) {} 

//登录
  async login(createUser:CreateUserDto){
    const { username,password } = createUser;
    
    const payload = { username };

    const existUser = await this.userRepository.findOne({
      where: { username }
  });  //验证密码是否正确
    if(existUser && await bcrypt.compare(password,existUser.password)){
      return {
        ...existUser,
        accessToken:this.jwtService.sign(payload)
      }
    }
    throw new HttpException("用户名或密码错误", HttpStatus.BAD_REQUEST)
}
```

### user.controller

添加登录接口

```ts
@UseInterceptors(ClassSerializerInterceptor)
  @Post('login')
   login(@Body() createUser: CreateUserDto){
    return this.userService.login(createUser)
   }
```

### user.module

```ts
@Module({
  imports:[
    TypeOrmModule.forFeature([User]),
    JwtModule.register({  //引入JWT模块
      secret:process.env.jwt_secret,
      signOptions:{expiresIn:'1d'}

    })],
  controllers: [UserController],
  providers: [UserService,JwtService]
})
```

