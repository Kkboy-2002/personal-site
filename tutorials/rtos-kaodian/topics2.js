// 考点 17–32（小白版）：同步与通信（后半）、中断、内存与稳定性、配置与对比
window.RTOS_TOPICS.push(
{
id:'event-group', group:'同步与通信', title:'事件组：等好几件事',
one:'事件组是一张打勾表，每一位是一件事。任务可以等"任一件"或"全部"都打勾。',
analogy:'出门要等 WiFi 连上、传感器准备好两件事都完成。事件组就是那张清单，两个勾都打上了才出发。',
qa:[
 {q:'和信号量的最大区别？', a:'一次能<b>叫醒所有</b>在等的任务（广播），信号量只叫醒一个。'},
 {q:'常见用法？', a:'开机时等多个模块都初始化完；一个任务同时等好几种事件。'},
],
note:'Main 等 WIFI 和 SENSOR 两个勾。两个初始化任务先后打勾，第二个勾打上时 Main 才醒。',
code:`EventGroupHandle_t xEG;             /* 打勾表 */
#define BIT_WIFI    (1 << 0)
#define BIT_SENSOR  (1 << 1)
int got;

void vWifiInit(void *p)   { wifi_connect(); wifi_connect(); xEventGroupSetBits(xEG, BIT_WIFI);   vTaskDelete(NULL); }
void vSensorInit(void *p) { sensor_init(); sensor_init(); sensor_init(); sensor_init(); xEventGroupSetBits(xEG, BIT_SENSOR); vTaskDelete(NULL); }

void vMainTask(void *p)              /* 优先级 3 */
{
    got = xEventGroupWaitBits(xEG,
            BIT_WIFI | BIT_SENSOR,    /* 等这两个勾 */
            pdTRUE,                   /* 醒来后把勾擦掉 */
            pdTRUE,                   /* 要全部打勾；pdFALSE 是任一 */
            portMAX_DELAY);
    printf("all ready\\n");
    for (;;) { vTaskDelay(10); }
}`,
sim:{ vars:[['xEG','EventGroupHandle_t',0],['got','int',0]], objs:[{kind:'eg',name:'xEG'}],
 tasks:[
  {name:'Main',prio:3,run:function*(k,m){ const b = yield k.egWait('got = xEventGroupWaitBits','xEG',3,true,true,Infinity); yield k.exec('BIT_WIFI | BIT_SENSOR,',m=>m.set('got',b)); yield k.printf('printf("all ready','all ready'); for(;;) yield k.delay('vTaskDelay(10)',10); }},
  {name:'WifiInit',prio:1,run:function*(k,m){ yield k.L('wifi_connect(); wifi_connect()'); yield k.L('wifi_connect(); wifi_connect()'); yield k.egSet('xEventGroupSetBits(xEG, BIT_WIFI)','xEG',1); yield k.del('BIT_WIFI);   vTaskDelete',null); }},
  {name:'SensorInit',prio:1,run:function*(k,m){ for(let i=0;i<4;i++) yield k.L('sensor_init(); sensor_init();'); yield k.egSet('xEventGroupSetBits(xEG, BIT_SENSOR)','xEG',2); yield k.del('BIT_SENSOR); vTaskDelete',null); }},
 ]},
},
{
id:'notify', group:'同步与通信', title:'任务通知：最快的叫醒方式',
one:'任务通知是直接拍某个任务的肩膀，不用先创建信号量，所以更快更省内存。',
analogy:'信号量是在公司装个门铃，谁听到谁来；任务通知是直接走到某个人桌前拍他一下。快，但只能拍一个人，而且你得知道他是谁。',
qa:[
 {q:'快在哪？', a:'省掉了中间的内核对象，直接改目标任务的档案卡（TCB）。官方说快 45%。'},
 {q:'什么时候不能用？', a:'<b>1.</b> 好几个任务等同一件事（通知只能给一个任务）。\n<b>2.</b> 发送方不知道接收任务是谁。\n<b>3.</b> 需要排队缓存多条数据（通知只有一个值）。'},
],
note:'点"触发中断"：中断拍 Handler 的肩膀，Handler 立刻醒。连点两次，通知会计数，不丢。',
code:`TaskHandle_t hHandler;
int notifyVal = 0, bg = 0;

void UART_IRQHandler(void)
{
    BaseType_t woken = pdFALSE;
    vTaskNotifyGiveFromISR(hHandler, &woken);   /* 拍 Handler 的肩膀 */
    portYIELD_FROM_ISR(woken);
}

void vHandlerTask(void *p)           /* 优先级 2 */
{
    for (;;) {
        notifyVal = ulTaskNotifyTake(pdFALSE, portMAX_DELAY);   /* 等人拍我 */
        printf("got notify\\n");
    }
}

void vBackgroundTask(void *p) { for (;;) { bg++; } }   /* 优先级 1 */`,
sim:{ vars:[['hHandler','TaskHandle_t',0],['notifyVal','int',0],['bg','int',0],['xHigherPriorityTaskWoken','BaseType_t',0]],
 isr:{name:'UART_IRQHandler',run:function*(k,m){ yield k.exec('BaseType_t woken',m=>m.set('xHigherPriorityTaskWoken',0)); yield k.notifyGiveISR('vTaskNotifyGiveFromISR','Handler','xHigherPriorityTaskWoken'); yield k.yieldFromISR('portYIELD_FROM_ISR','xHigherPriorityTaskWoken'); }},
 tasks:[
  {name:'Handler',prio:2,run:function*(k,m){ for(;;){ const v = yield k.notifyTake('ulTaskNotifyTake(pdFALSE',false,Infinity); yield k.printf('printf("got notify',m=>{m.set('notifyVal',v);return 'got notify（通知值 '+v+'）';}); } }},
  {name:'Background',prio:1,run:function*(k,m){ for(;;){ yield k.exec('bg++',m=>m.set('bg',m.get('bg')+1)); } }},
 ]},
},
{
id:'timer', group:'同步与通信', title:'软件定时器',
one:'软件定时器不用硬件，是一个专门的"闹钟任务"帮你到点调回调函数。',
analogy:'公司有个专职秘书（守护任务），你跟她说"4 分钟后提醒我"，到点她来叫你。她同时管很多人的提醒，所以你的回调不能拖她太久。',
qa:[
 {q:'回调函数在哪里执行？', a:'在定时器守护任务里，不是中断里。所以<b>回调里不能阻塞</b>，否则所有定时器都被拖住。'},
 {q:'单次和周期？', a:'创建时选：到期一次就停，或者到期后自动重来。'},
],
note:'周期 4 tick 的定时器，回调在 TmrSvc（优先级 3）里跑，会打断 Work（优先级 1）。',
code:`TimerHandle_t xTmr;                  /* xTimerCreate("t", 4, pdTRUE, NULL, cb)：每 4 tick 一次 */
int ticks = 0, work = 0;

void vTimerCallback(TimerHandle_t t) /* 在守护任务 TmrSvc 里执行 */
{
    ticks++;
    toggle_led();                     /* 不能在这里睡觉 */
}

void vWorkTask(void *p)              /* 优先级 1 */
{
    xTimerStart(xTmr, 0);             /* 告诉秘书：开始计时 */
    for (;;) {
        work++;
    }
}`,
sim:{ timerPrio:3, vars:[['xTmr','TimerHandle_t',0],['ticks','int',0],['work','int',0]],
 objs:[{kind:'timer',name:'xTmr',period:4,auto:true,cb:function*(k,m){ yield k.exec('ticks++',m=>m.set('ticks',m.get('ticks')+1)); yield k.printf('toggle_led();','LED 翻转'); }}],
 tasks:[ {name:'Work',prio:1,run:function*(k,m){ yield k.timerStart('xTimerStart(xTmr, 0)','xTmr'); for(;;){ yield k.exec('work++',m=>m.set('work',m.get('work')+1)); } }} ]},
},
{
id:'stream-buffer', group:'同步与通信', title:'流缓冲区',
one:'队列传的是一个个"盒子"，流缓冲区传的是"水流"，一次可以放任意多字节。',
analogy:'队列像传送带上的快递箱，每个箱子一样大；流缓冲区像水管，想倒多少倒多少，对面想接多少接多少。',
qa:[
 {q:'什么时候用？', a:'串口收发这种连续字节流。中断一个字节一个字节地灌，任务攒够一包再处理。'},
 {q:'限制？', a:'只能<b>一个写、一个读</b>。多个任务共用要自己加锁。'},
],
code:`StreamBufferHandle_t xSB;            /* 水管：128 字节，攒够 4 字节才叫醒读的人 */
uint8_t buf[32];

void UART_IRQHandler(void)
{
    BaseType_t woken = pdFALSE;
    uint8_t c = UART->DR;
    xStreamBufferSendFromISR(xSB, &c, 1, &woken);   /* 灌一个字节 */
    portYIELD_FROM_ISR(woken);
}

void vParserTask(void *p)
{
    for (;;) {
        int n = xStreamBufferReceive(xSB, buf, 32, portMAX_DELAY);  /* 接最多 32 字节 */
        parse(buf, n);
    }
}`,
},
{
id:'queue-set', group:'同步与通信', title:'队列集：同时等多个队列',
one:'一个任务想同时等好几个队列，就把它们绑成一个"集合"，哪个来数据就先处理哪个。',
analogy:'你同时盯着微信、短信、邮件三个 App 太累，队列集像一个统一的通知中心，谁来消息它告诉你是谁。',
qa:[
 {q:'更简单的替代？', a:'通常只用<b>一个队列</b>，消息里带一个 type 字段区分来源，比队列集省事。'},
],
code:`QueueHandle_t xQ1, xQ2;
QueueSetHandle_t xSet;

void vTask(void *p)
{
    xSet = xQueueCreateSet(10);       /* 集合容量 = 各队列长度之和 */
    xQueueAddToSet(xQ1, xSet);
    xQueueAddToSet(xQ2, xSet);
    for (;;) {
        QueueSetMemberHandle_t h = xQueueSelectFromSet(xSet, portMAX_DELAY);  /* 谁来数据了？ */
        if (h == xQ1) { xQueueReceive(xQ1, &v, 0); handle1(v); }
        else          { xQueueReceive(xQ2, &v, 0); handle2(v); }
    }
}

/* 更常见的写法：一个队列，消息带类型 */
typedef struct { int type; int data; } msg_t;`,
},
// ============ 中断 ============
{
id:'isr-api', group:'中断', title:'中断里只能用 FromISR 函数',
one:'中断里不能"等"，所以只能用永不阻塞的 FromISR 版本，并在最后告诉内核"要不要马上换人"。',
analogy:'接电话时（中断）不能放下电话去干别的，只能在便签上记一笔（FromISR 通知任务），挂电话时决定要不要立刻去处理这件事（portYIELD_FROM_ISR）。',
qa:[
 {q:'xHigherPriorityTaskWoken 是干嘛的？', a:'FromISR 函数通过它告诉你："我叫醒了一个比被打断的任务更急的任务"。你在中断末尾调 portYIELD_FROM_ISR 把它传进去，为真就立刻切换，否则要等下一个 tick 才切换。'},
 {q:'中断里该做什么？', a:'只做三件事：清标志、拿数据、通知任务。耗时的活交给任务。'},
],
note:'点"触发中断"。本例偶数次调用 portYIELD_FROM_ISR、奇数次故意不调：看日志里 Handler 是"立即运行"还是"Background 先多跑一行"。',
code:`QueueHandle_t xQ;
int isrCount = 0, rxData = 0, bg = 0;

void ADC_IRQHandler(void)
{
    BaseType_t woken = pdFALSE;
    int sample = ADC->DR;
    xQueueSendFromISR(xQ, &sample, &woken);    /* 不会阻塞 */
    if (isrCount % 2 == 0)
        portYIELD_FROM_ISR(woken);             /* 偶数次：立刻换人 */
    /* 奇数次故意不调：Handler 要等下一个 tick */
    isrCount++;
}

void vHandlerTask(void *p)           /* 优先级 3 */
{
    for (;;) {
        xQueueReceive(xQ, &rxData, portMAX_DELAY);
        printf("sample\\n");
    }
}

void vBackgroundTask(void *p) { for (;;) { bg++; } }   /* 优先级 1 */`,
sim:{ vars:[['xQ','QueueHandle_t',0],['isrCount','int',0],['rxData','int',0],['bg','int',0],['xHigherPriorityTaskWoken','BaseType_t',0]], objs:[{kind:'queue',name:'xQ',len:4}],
 isr:{name:'ADC_IRQHandler',run:function*(k,m){ yield k.exec('BaseType_t woken',m=>m.set('xHigherPriorityTaskWoken',0)); yield k.L('int sample = ADC->DR'); yield k.qSendISR('xQueueSendFromISR','xQ',m=>100+m.get('isrCount'),'xHigherPriorityTaskWoken'); const even = yield k.exec('if (isrCount % 2 == 0)',m=>m.get('isrCount')%2===0); if(even) yield k.yieldFromISR('portYIELD_FROM_ISR','xHigherPriorityTaskWoken'); yield k.exec('isrCount++',m=>m.set('isrCount',m.get('isrCount')+1)); }},
 tasks:[
  {name:'Handler',prio:3,run:function*(k,m){ for(;;){ yield k.qRecv('xQueueReceive(xQ, &rxData','xQ','rxData',Infinity); yield k.printf('printf("sample',m=>'sample='+m.get('rxData')); } }},
  {name:'Background',prio:1,run:function*(k,m){ for(;;){ yield k.exec('bg++',m=>m.set('bg',m.get('bg')+1)); } }},
 ]},
},
{
id:'isr-block', group:'中断', title:'反例：中断里阻塞会怎样',
one:'中断没有"自己的任务"，它一阻塞，被挂起的其实是被打断的那个无辜任务，系统直接乱掉。',
analogy:'接电话时你说"我等快递到了再挂"，结果你不是收件人，快递也永远不会给你。所有人都被你卡住。',
qa:[
 {q:'实际会发生什么？', a:'FreeRTOS 的 configASSERT 会直接停机报错。关了断言就是随机崩溃。'},
],
note:'点"触发中断"，中断第 6 行调了阻塞函数，模拟器直接停机说明原因。',
code:`SemaphoreHandle_t xSem;

void BAD_IRQHandler(void)
{
    clear_flag();
    xSemaphoreTake(xSem, portMAX_DELAY);   /* 错！中断里等 */
    do_something();
}

void vTask(void *p) { for (;;) { vTaskDelay(2); } }`,
sim:{ vars:[['xSem','SemaphoreHandle_t',0]], objs:[{kind:'sem',name:'xSem'}],
 isr:{name:'BAD_IRQHandler',run:function*(k,m){ yield k.L('clear_flag()'); yield k.illegalBlockInISR('xSemaphoreTake(xSem, portMAX_DELAY);   /* 错','xSem'); yield k.L('do_something()'); }},
 tasks:[ {name:'Task',prio:1,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(2)',2); } }} ]},
},
{
id:'irq-priority', group:'中断', title:'中断优先级怎么配',
one:'用一条线（configMAX_SYSCALL_INTERRUPT_PRIORITY）把中断分两类：线以下的能调 RTOS 函数，线以上的绝对不能。',
analogy:'公司规定：普通员工的电话（低优先级中断）可以让前台转接（调 RTOS 函数），但会被"请勿打扰"挡住；老板的专线（高优先级中断）永远接得通，但前台不管，你得自己处理。',
qa:[
 {q:'Cortex-M 的数字怎么理解？', a:'<b>数字越小越急</b>。STM32 常设分界线为 5：优先级 5~15 的中断能调 FromISR 函数，0~4 的不能。'},
 {q:'配错会怎样？', a:'高优先级中断调了 RTOS 函数，会在内核改数据改到一半时插进来，表现为偶尔莫名其妙崩溃，很难查。'},
 {q:'NVIC 分组？', a:'必须设成 4 位全抢占（NVIC_PriorityGroup_4）。'},
],
code:`/* FreeRTOSConfig.h（STM32） */
#define configMAX_SYSCALL_INTERRUPT_PRIORITY  (5 << 4)   /* 分界线：优先级 5 */
#define configKERNEL_INTERRUPT_PRIORITY       (15 << 4)  /* PendSV / SysTick 最低 */

/* main.c */
NVIC_PriorityGroupConfig(NVIC_PriorityGroup_4);          /* 4 位全抢占 */

HAL_NVIC_SetPriority(USART1_IRQn, 6, 0);   /* 6 在线以下：可以调 xQueueSendFromISR */
HAL_NVIC_SetPriority(TIM2_IRQn,   2, 0);   /* 2 在线以上：永远不被屏蔽，
                                              但里面禁止调任何 FreeRTOS 函数 */

/*  优先级   0  1  2  3  4 │ 5  6  ...  15
    被临界区屏蔽？  否     │ 是
    能调 FromISR？  否     │ 是                    */`,
},
{
id:'critical', group:'中断', title:'临界区 vs 挂起调度器',
one:'临界区是"谁都别打扰我"（中断也挡住）；挂起调度器是"别的任务别打扰我"（中断照常来）。',
analogy:'临界区像把手机关机：几秒钟内谁都找不到你。挂起调度器像挂"忙碌"：电话照接，但同事不能插队安排你干别的。',
qa:[
 {q:'什么时候用哪个？', a:'<b>临界区</b>：改一两个变量这种极短操作，尤其中断也会碰的数据。\n<b>挂起调度器</b>：稍长的操作，只怕别的任务打扰、不怕中断。'},
 {q:'共同的规矩？', a:'都要尽量短，里面都不能阻塞。'},
],
note:'步进到第 8~9 行时点"触发中断"：中断被挡住，退出临界区才响应。步进到第 14~16 行再点：中断马上跑，Handler 变就绪，但到 xTaskResumeAll 才切换过去。',
code:`SemaphoreHandle_t xSem;
int shared = 0;

void vTaskA(void *p)                 /* 优先级 1 */
{
    for (;;) {
        taskENTER_CRITICAL();         /* 手机关机：中断被挡 */
        shared++;
        shared++;
        taskEXIT_CRITICAL();          /* 开机：被挡的中断现在进来 */
        vTaskDelay(2);

        vTaskSuspendAll();            /* 挂"忙碌"：中断照常，任务不切换 */
        shared++;
        shared++;
        shared++;
        xTaskResumeAll();             /* 取消忙碌：该切换的现在切 */
        vTaskDelay(2);
    }
}

void EXTI_IRQHandler(void)
{
    BaseType_t woken = pdFALSE;
    xSemaphoreGiveFromISR(xSem, &woken);
    portYIELD_FROM_ISR(woken);
}

void vHandlerTask(void *p)           /* 优先级 2 */
{ for (;;) { xSemaphoreTake(xSem, portMAX_DELAY); printf("handled\\n"); } }`,
sim:{ vars:[['xSem','SemaphoreHandle_t',0],['shared','int',0],['xHigherPriorityTaskWoken','BaseType_t',0]], objs:[{kind:'sem',name:'xSem'}],
 isr:{name:'EXTI_IRQHandler',run:function*(k,m){ yield k.exec('BaseType_t woken',m=>m.set('xHigherPriorityTaskWoken',0)); yield k.semGiveISR('xSemaphoreGiveFromISR','xSem','xHigherPriorityTaskWoken'); yield k.yieldFromISR('portYIELD_FROM_ISR','xHigherPriorityTaskWoken'); }},
 tasks:[
  {name:'TaskA',prio:1,run:function*(k,m){ const inc=w=>k.exec(w,m=>m.set('shared',m.get('shared')+1)); for(;;){ yield k.enterCritical('taskENTER_CRITICAL()'); yield inc('shared++;#1'); yield inc('shared++;#2'); yield k.exitCritical('taskEXIT_CRITICAL()'); yield k.delay('vTaskDelay(2);#1',2); yield k.suspendAll('vTaskSuspendAll()'); yield inc('shared++;#3'); yield inc('shared++;#4'); yield inc('shared++;#5'); yield k.resumeAll('xTaskResumeAll()'); yield k.delay('vTaskDelay(2);#2',2); } }},
  {name:'Handler',prio:2,run:function*(k,m){ for(;;){ yield k.semTake('xSemaphoreTake(xSem, portMAX_DELAY); printf','xSem',Infinity); yield k.printf('printf("handled','handled'); } }},
 ]},
},
// ============ 内存与稳定性 ============
{
id:'heap', group:'内存与稳定性', title:'内存管理：heap_1 到 heap_5',
one:'FreeRTOS 自带 5 种"仓库管理员"，区别就在能不能退货、退货后会不会把空位合并起来。',
analogy:'heap_1 只发不收；heap_2 收货但空位不合并，久了全是小缝隙；heap_4 收货并把相邻空位合并成大块（最常用）；heap_5 是 heap_4 管多个仓库；heap_3 是外包给标准库 malloc。',
qa:[
 {q:'选哪个？', a:'一般选 <b>heap_4</b>。永不释放的简单系统用 heap_1。有外部 SDRAM 用 heap_5。'},
 {q:'内存碎片是什么？', a:'总剩余很多，但每块都很小，申请一个大块就失败。heap_4 合并相邻空位就是为了减少碎片。'},
 {q:'分配失败怎么发现？', a:'开 configUSE_MALLOC_FAILED_HOOK，写一个失败钩子打印报警。'},
],
note:'堆只有 3KB。申请三次 1200 字节，第三次失败触发钩子；释放 p1 后再申请就成功了。',
code:`/* configTOTAL_HEAP_SIZE = 3 * 1024 */
uint8_t *p1, *p2, *p3;
int freeHeap;

void vApplicationMallocFailedHook(void)
{
    printf("malloc failed!\\n");      /* 申请失败时被调用 */
}

void vAllocTask(void *p)
{
    p1 = pvPortMalloc(1200);
    p2 = pvPortMalloc(1200);
    p3 = pvPortMalloc(1200);          /* 仓库只剩 96 B → 失败，返回 NULL */
    freeHeap = xPortGetFreeHeapSize();
    vPortFree(p1);                    /* 退货 */
    p3 = pvPortMalloc(1200);          /* 现在成功 */
    for (;;) { vTaskDelay(10); }
}`,
sim:{ heap:3072, vars:[['p1','uint8_t *',0],['p2','uint8_t *',0],['p3','uint8_t *',0],['freeHeap','int',0]],
 tasks:[ {name:'Alloc',prio:1,stack:256,run:function*(k,m){ yield k.malloc('p1 = pvPortMalloc(1200)','p1',1200); yield k.malloc('p2 = pvPortMalloc(1200)','p2',1200); const r = yield k.malloc('p3 = pvPortMalloc(1200);          /* 仓库','p3',1200); if(!r) yield k.printf('printf("malloc failed','malloc failed!'); yield k.exec('freeHeap = xPortGetFreeHeapSize()',(m,t,s)=>m.set('freeHeap',s.heapSize-s.heapUsed)); yield k.free('vPortFree(p1)','p1'); yield k.malloc('p3 = pvPortMalloc(1200);          /* 现在','p3',1200); for(;;) yield k.delay('vTaskDelay(10)',10); }} ]},
},
{
id:'stack-overflow', group:'内存与稳定性', title:'栈溢出怎么查、怎么防',
one:'任务的草稿纸（栈）写满了会写到隔壁任务的纸上，表现为莫名其妙的崩溃。',
analogy:'每人一张固定大小的草稿纸。函数调得越深、局部变量越大，纸用得越多。写出边界就涂到了邻居的纸上。',
qa:[
 {q:'怎么查？', a:'<b>1.</b> 开 configCHECK_FOR_STACK_OVERFLOW=2，溢出时内核调你的钩子函数。\n<b>2.</b> 用 uxTaskGetStackHighWaterMark 看"历史最少剩余"，接近 0 就危险。'},
 {q:'怎么防？', a:'栈按最坏情况多留 30%；大数组别放局部变量；少用递归；printf 很吃栈。'},
],
note:'Deep 任务递归 6 层，每层 96 字节，栈只有 512。步进看栈条变红，溢出时钩子触发停机。',
code:`/* configCHECK_FOR_STACK_OVERFLOW = 2 */
int hwm;

void vApplicationStackOverflowHook(TaskHandle_t t, char *name)
{
    printf("STACK OVERFLOW: %s\\n", name);
    for (;;);                         /* 停住，等看门狗复位 */
}

int parse(int depth)                  /* 每层占 96 字节 */
{
    char local[96];
    if (depth == 0) return 0;
    return parse(depth - 1) + 1;      /* 递归 6 层 = 576 B > 512 B */
}

void vDeepTask(void *p)              /* 栈 512 B */
{
    for (;;) { parse(6); vTaskDelay(3); }
}

void vMonTask(void *p)
{
    for (;;) { hwm = uxTaskGetStackHighWaterMark(hDeep); vTaskDelay(1); }
}`,
sim:{ stackCheck:true, vars:[['hwm','int',0]],
 tasks:[
  {name:'Deep',prio:2,stack:512,run:function*(k,m){ for(;;){ for(let d=6;d>0;d--){ yield k.stackUse('char local[96]',96); yield k.L('return parse(depth - 1) + 1'); } for(let d=0;d<6;d++) yield k.stackFree('if (depth == 0) return 0',96); yield k.delay('vTaskDelay(3)',3); } }},
  {name:'Mon',prio:1,run:function*(k,m){ for(;;){ yield k.exec('uxTaskGetStackHighWaterMark',(m,t,s)=>{const d=s.byName('Deep'); m.set('hwm',Math.max(0,d.stackSize-d.stackMax));}); yield k.delay('vTaskDelay(1)',1); } }},
 ]},
},
{
id:'watchdog', group:'内存与稳定性', title:'看门狗怎么防任务卡死',
one:'每个关键任务定期打卡，一个监控任务检查大家都打了卡才喂狗；有人没打卡就不喂，硬件狗超时复位。',
analogy:'班长每 8 分钟查一次考勤表，全员签到才向老师报平安。谁没签到就不报，老师（硬件看门狗）等不到就重启整个班。',
qa:[
 {q:'为什么不能直接在空闲任务里喂狗？', a:'某个任务卡死时空闲任务照样在跑，狗照喂，卡死查不出来。'},
 {q:'监控任务优先级怎么定？', a:'中等偏高。设最高它总能喂上狗，查不出高优先级任务死循环；设最低稍微忙点就误复位。'},
],
note:'Comm 在 tick 20 后卡死。Monitor 每 8 tick 查一次，发现 Comm 没打卡就不喂狗，硬件狗超时后模拟器停机。',
code:`EventGroupHandle_t xAlive;          /* 考勤表：每个任务一位 */
#define BIT_SENSOR (1<<0)
#define BIT_COMM   (1<<1)
SemaphoreHandle_t xNever;            /* 永远等不到的信号量 */
int fed = 0;

void vSensorTask(void *p) { for (;;) { read(); xEventGroupSetBits(xAlive, BIT_SENSOR); vTaskDelay(3); } }

void vCommTask(void *p)              /* tick 20 后卡死 */
{
    for (;;) {
        if (xTaskGetTickCount() > 20)
            xSemaphoreTake(xNever, portMAX_DELAY);   /* 永远等不到 → 卡死 */
        xEventGroupSetBits(xAlive, BIT_COMM);        /* 打卡 */
        vTaskDelay(2);
    }
}

void vMonitorTask(void *p)           /* 优先级 3 */
{
    for (;;) {
        vTaskDelay(8);
        int b = xEventGroupGetBits(xAlive);
        if (b == (BIT_SENSOR | BIT_COMM)) {
            xEventGroupClearBits(xAlive, b);
            IWDG_Feed(); fed++;       /* 全员打卡才喂狗 */
        } else {
            printf("task dead\\n");   /* 不喂 → 硬件复位 */
        }
    }
}`,
sim:{ vars:[['xAlive','EventGroupHandle_t',0],['xNever','SemaphoreHandle_t',0],['fed','int',0],['iwdgCounter','int',16]], objs:[{kind:'eg',name:'xAlive'},{kind:'sem',name:'xNever'}],
 tasks:[
  {name:'Sensor',prio:2,run:function*(k,m){ for(;;){ yield k.L('read();'); yield k.egSet('xEventGroupSetBits(xAlive, BIT_SENSOR)','xAlive',1); yield k.delay('vTaskDelay(3)',3); } }},
  {name:'Comm',prio:2,run:function*(k,m){ for(;;){ const dead = yield k.exec('if (xTaskGetTickCount() > 20)',(m,t,s)=>s.tick>20); if(dead) yield k.semTake('xSemaphoreTake(xNever','xNever',Infinity); yield k.egSet('xEventGroupSetBits(xAlive, BIT_COMM)','xAlive',2); yield k.delay('vTaskDelay(2)',2); } }},
  {name:'Monitor',prio:3,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(8)',8); const b = yield k.exec('xEventGroupGetBits(xAlive)',(m)=>m.obj('xAlive').bits); if(b===3){ yield k.exec('xEventGroupClearBits',m=>{m.obj('xAlive').bits=0;}); yield k.exec('IWDG_Feed(); fed++',m=>{m.set('fed',m.get('fed')+1); m.set('iwdgCounter',16);}); } else { yield k.printf('printf("task dead',m=>'task dead（Comm 没打卡，不喂狗）'); } } }},
 ],
 tickHook:(s,m)=>{ const c=m.get('iwdgCounter')-1; m.set('iwdgCounter',c); if(c<=0 && !s.halted) s.halt('硬件看门狗超时 → 系统复位（Monitor 发现 Comm 卡死后停止喂狗）'); },
 },
},
{
id:'reentrant', group:'内存与稳定性', title:'共享变量为什么会算错',
one:'counter++ 其实是"读、加、写"三步。两个任务交错执行，一个的结果会被另一个覆盖。',
analogy:'两个人同时给同一个存钱罐记账：都看到 5 块，各自加 1 写回，最后是 6 而不是 7。',
qa:[
 {q:'volatile 能解决吗？', a:'不能。volatile 只保证每次真的去内存读写，挡不住中间被切走。'},
 {q:'怎么解决？', a:'把三步包进临界区（taskENTER_CRITICAL），或者用互斥量，或者用原子操作。'},
 {q:'printf 能在多个任务里随便用吗？', a:'不能，它内部有共享缓冲。要么加互斥量，要么只让一个日志任务打印。'},
],
note:'两个任务各加 10 次，期望 counter=20。模拟器把 ++ 拆成三行，同优先级轮流跑，结果小于 20。',
code:`volatile int counter = 0;            /* volatile 挡不住竞争 */
int tmpA, tmpB;

void vTaskA(void *p)                 /* 优先级 1 */
{
    for (int i = 0; i < 10; i++) {
        tmpA = counter;               /* 读 */
        tmpA = tmpA + 1;              /* 加 */
        counter = tmpA;               /* 写：可能覆盖 B 刚写的 */
    }
    vTaskDelete(NULL);
}

void vTaskB(void *p)                 /* 优先级 1 */
{
    for (int i = 0; i < 10; i++) {
        tmpB = counter;
        tmpB = tmpB + 1;
        counter = tmpB;
    }
    vTaskDelete(NULL);
}
/* 修法：taskENTER_CRITICAL(); counter++; taskEXIT_CRITICAL(); */`,
sim:{ vars:[['counter','int',0],['tmpA','int',0],['tmpB','int',0]],
 tasks:[
  {name:'TaskA',prio:1,run:function*(k,m){ for(let i=0;i<10;i++){ yield k.exec('tmpA = counter',m=>m.set('tmpA',m.get('counter'))); yield k.exec('tmpA = tmpA + 1',m=>m.set('tmpA',m.get('tmpA')+1)); yield k.exec('counter = tmpA',m=>m.set('counter',m.get('tmpA'))); } yield k.del('vTaskDelete(NULL);#1',null); }},
  {name:'TaskB',prio:1,run:function*(k,m){ for(let i=0;i<10;i++){ yield k.exec('tmpB = counter',m=>m.set('tmpB',m.get('counter'))); yield k.exec('tmpB = tmpB + 1',m=>m.set('tmpB',m.get('tmpB')+1)); yield k.exec('counter = tmpB',m=>m.set('counter',m.get('tmpB'))); } yield k.del('vTaskDelete(NULL);#2',null); }},
 ]},
},
{
id:'tickless', group:'内存与稳定性', title:'tick 与低功耗',
one:'tick 是系统心跳。没人干活时可以暂停心跳、让 CPU 深睡，到该醒的时候再补上心跳数，这叫 Tickless。',
analogy:'值夜班的人知道下一个闹钟是 3 小时后，就把每分钟一响的秒表关了，定个 3 小时的闹钟直接睡，醒来把钟拨到正确时间。',
qa:[
 {q:'tick 频率怎么选？', a:'一般 1000Hz（1ms）。频率越高延时越精细，但心跳中断本身也耗电耗 CPU。'},
 {q:'延时怎么写才不依赖 tick 频率？', a:'用 pdMS_TO_TICKS(500) 而不是直接写 500。'},
],
code:`/* FreeRTOSConfig.h */
#define configTICK_RATE_HZ       1000     /* 1 tick = 1 ms */
#define configUSE_TICKLESS_IDLE  1        /* 开 Tickless */

/* 空闲时内核自动调用（简化） */
void vPortSuppressTicksAndSleep(TickType_t idleTicks)
{
    stop_systick();                       /* 关心跳 */
    set_wakeup_timer(idleTicks);          /* 定一个 idleTicks 后的闹钟 */
    __WFI();                              /* 深睡 */
    vTaskStepTick(actually_slept());      /* 醒来补上心跳数 */
    start_systick();
}

vTaskDelay(pdMS_TO_TICKS(500));           /* 500ms，和 tick 频率无关 */`,
},
// ============ 配置与对比 ============
{
id:'config', group:'配置与对比', title:'FreeRTOSConfig.h 里最该认识的几个',
one:'配置文件是 RTOS 的"开关面板"，面试常问的就十来个。',
qa:[
 {q:'哪几个必须会？', a:'configUSE_PREEMPTION（抢占开关）、configTICK_RATE_HZ（心跳频率）、configMAX_PRIORITIES（几级优先级）、configTOTAL_HEAP_SIZE（仓库多大）、configMINIMAL_STACK_SIZE（空闲任务的栈，单位是字）、configCHECK_FOR_STACK_OVERFLOW（栈溢出检测）、configMAX_SYSCALL_INTERRUPT_PRIORITY（中断分界线）。'},
 {q:'configASSERT 是什么？', a:'内核自带的"错误检查点"，抓中断优先级配错、句柄为空这类低级错误，出错就停在那里方便调试。开发阶段一定要开。'},
],
code:`#define configUSE_PREEMPTION            1     /* 抢占：急事先干 */
#define configUSE_TIME_SLICING          1     /* 同级轮流 */
#define configTICK_RATE_HZ              1000  /* 心跳 1ms */
#define configMAX_PRIORITIES            8     /* 0~7 共 8 级 */
#define configMINIMAL_STACK_SIZE        128   /* 字！= 512 字节 */
#define configTOTAL_HEAP_SIZE           (16 * 1024)
#define configUSE_MUTEXES               1
#define configUSE_TIMERS                1
#define configTIMER_TASK_PRIORITY       7     /* 定时器秘书的优先级 */
#define configUSE_IDLE_HOOK             1
#define configCHECK_FOR_STACK_OVERFLOW  2     /* 栈溢出检测 */
#define configUSE_MALLOC_FAILED_HOOK    1     /* 内存不够时报警 */
#define configMAX_SYSCALL_INTERRUPT_PRIORITY (5 << 4)   /* 中断分界线 */

#define configASSERT(x) if ((x) == 0) { taskDISABLE_INTERRUPTS(); for (;;); }`,
},
{
id:'compare', group:'配置与对比', title:'FreeRTOS 和其它系统怎么比',
one:'FreeRTOS 小而纯，只有内核；RT-Thread 组件全；uC/OS 有安全认证；Linux 不是实时系统。',
qa:[
 {q:'FreeRTOS 和 Linux 的区别？', a:'Linux 有进程隔离、内存 MB 级、启动要几秒、不保证实时。FreeRTOS 所有任务共用内存、内存 KB 级、毫秒启动、微秒级响应。'},
 {q:'几个 RTOS 怎么选？', a:'<b>FreeRTOS</b>：免费、最小、移植最多，适合学习和大部分产品。\n<b>RT-Thread</b>：国产，文件系统、网络、GUI 都自带。\n<b>uC/OS</b>：医疗航空要认证时用。\n<b>Zephyr</b>：蓝牙、网络协议栈最全，学习曲线陡。'},
 {q:'FreeRTOS 支持双核吗？', a:'支持（SMP 版本），ESP32 用的就是。可以把任务钉在某个核上。'},
],
code:`/*  项目       FreeRTOS     RT-Thread    uC/OS-III    Zephyr        */
/*  许可       MIT 免费     Apache 免费  Apache 免费  Apache 免费   */
/*  内核大小   6~10 KB      ~10 KB       ~20 KB       ~8 KB+        */
/*  自带组件   只有内核     很全         需另买       协议栈最全    */
/*  多核       V11 支持     支持         支持         支持          */

/* ESP32 上把任务钉在核 1 */
xTaskCreatePinnedToCore(vCtrlTask, "ctrl", 4096, NULL, 5, NULL, 1);`,
},
);
