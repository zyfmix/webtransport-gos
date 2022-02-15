### 百家云工具库

#### 构建

npm run tsc

#### 使用

项目 package.json 添加

```json
{
  "devDependencies": {
    "bjy-common": "git+ssh://git@git.baijiashilian.com:LLL/brtc/bjy-common.git#master"
  }
}
```

如果使用的 typescript 项目，可以直接引用 src 目录下面的源码，并在 tsconfig.json 下配置：

```json
{
  "include": [
    ...
    "./node_modules/bjy-common/src/**/*.ts"
  ],
  "files": [
    // 小程序的声明文件
    "./node_modules/miniprogram-api-typings/index.d.ts"
  ]
}
```

执行 ```npm install```； 确保 ssh 公钥已添加到 gitlab 上

```typescript``` 直接引用源码 ```src``` 目录下的文件

```javascript``` 引用 ```lib``` 目录下的文件


#### 目录

- function
  - camelCase 其他格式命名转小驼峰命名
  - camelCaseObject 将对象的所有键的格式命名转小驼峰命名
  - concatTypeArray 合并 TypeArray
  - debounce 防抖
  - execute 使用指定上下文执行一个函数
  - file2Url 模块转 blob url，可用于将模块代码放入 worker 中执行（只适用于使用 webpack 打包的项目）
  - generateUUID 生成随机 uuid
  - getTimestamp 获取当前时间戳
  - isDef 判断是否定义
  - isNative 判断是否是 native 方法
  - nextTick 注册下一个时间片执行
  - restrain 对值的范围进行约束
  - serial 串行执行一组方法
  - split 拆解字符串，并 trim 每个部分
  - throttling 节流
  - toNumber 强转为 number
  - toString 强转为字符串
  - underScoreCase 其他格式命名转下划线命名
  - underScoreCaseObject 将对象的所有键的格式命名转下划线命名

- helper 
  - AjaxFileUploader ajax 实现的文件上传
  - CBuffer 循环队列实现
  - CommandQueue 异步任务顺序执行队列
  - Emitter 事件订阅器
  - LoopTask 循环任务队列，使用 worker 实现，规避浏览器页面不在前台时定时器间隔不能低于 1 秒
  - MapNS 带命名空间的 Map
  - MD5 计算 md5 值
  - MiniprogramWS 包装小程序的 ws 成 html5 的 ws
  - AsyncTask 异步任务队列
  - NetString netstring 实现
  - NoSleep h5 控制系统保持屏幕常亮
  - RingBuffer 循环 buffer 实现
  - Sleep 挂起系统
  - SoundMeter 音量计算器
  - StreamReader 字节流读取器
  - StreamWriter 写字节流器
  - Timer 定时器
  - Transport 数据传输器抽象，统一接口，底层传输通道可以是 ws，datachannel，小程序的 ws 等任何部署有 TransportInterface 接口的实现
  - WorkerClock worker 实现的时钟
  - WXFileUploader 微信小程序文件上传

- pthreads 
  - Atomics 原子操作
  - AtomicsDescriptionManager 原子操作描述符分配回收管理
  - cond 条件变量实现
  - mutex 锁实现
  - semaphore 信号量实现

- rpc
  - packer 消息打包器
    - Packer 消息打包器虚基类
    - JsonPacker json 格式消息打包器
  - RpcBuilder rpc 构造器
  - JsonRpcClient json rpc 客户端

- util
  - array 数组操作
  - browser 浏览器探测
  - cookie cookie 操作
  - is 类型判断
  - keypath 路径操作
  - localStrong localStrong 操作
  - logger 日志模块
  - network 网络类型探测
  - object 对象操作
  - os 操作系统探测
  - request http 请求
  - string 字符串操作
  - url url 操作

- webassembly
  - Buffer WebAssembly 内存管理模块
  - WebAssembly WebAssembly 模块基类实现

- webgl
  - frame 帧实现
  - program webgl 程序基类实现
  - render 后处理基类实现
  - shader 着色器基类实现
  - texture 纹理基类实现

- webrtc
  - components rtc 组件
    - DataChannel 包装 dataChannel 为 html ws 接口
    - Peer RTCPeerConnection 封装
    - RTCRecvOnly rtc 发送器
    - RTCSendOnly rtc 接收器
  - media
    - getUserMedia 媒体获取（屏幕分享和摄像头，兼容不同的浏览器）
    - getPermissions 获取浏览器音视频权限
    - getDevices 设备枚举
  - sdp
    - operator sdp 操作符
      - addExtmap 添加 sdp 中 extmap 属性
      - bandwidth 设置带宽
      - direction 设置 sdp 中 direction 属性
      - fmptConfig 设置 sdp 中 fmpt 属性值
      - msmsIP 解析 sdp 中 msip
      - planBSimulcast planB Simulcast 大小流处理
      - preferCodec 设置 sdp 中指定 codec 为最高优先级
      - profileReplace 替换 sdp 中 profile 为指定 profile
      - removeExtmap 移除 sdp 中 extmap 属性
      - removeSSRC 移除 sdp 中 ssrc 属性
      - rtcpFB 操作 rtcp-fb 属性
      - shrink 压缩 sdp
    - sdpOperatorPipe sdp 操作管道，用于管道化 sdp 操作符
  - stats
    - StatsCollector PeerConnection stats 收集器


