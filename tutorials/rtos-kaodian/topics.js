// 考点 01–16（小白版）：基础概念、同步与通信（前半）
window.RTOS_TOPICS = [
// ============ 基础概念 ============
{
id:'rtos-vs-bare', group:'基础概念', title:'为什么要用 RTOS',
one:'RTOS 就是一个"排班老板"：把程序拆成几个员工（任务），谁的事急就先让谁干。',
analogy:'裸机像一个人开小卖部：收银、补货、擦地全自己按顺序来，收银排队时地就没人擦。RTOS 像雇了三个人，还有个老板盯着，顾客一来收银员立刻上。',
qa:[
 {q:'裸机的问题是什么？', a:'所有事在一个大循环里排队。前面一件事耗时长，后面的事就得干等，反应慢。'},
 {q:'RTOS 好在哪？', a:'每件事是独立的任务，有自己的<b>优先级</b>。急事一来，老板（调度器）马上停下手头不急的活去处理，反应快、代码也不缠在一起。'},
 {q:'面试一句话总结？', a:'RTOS 用"任务 + 优先级 + 调度器"，把顺序执行的程序变成能随时被急事打断的多任务程序。'},
],
code:`/* 裸机：一个人干所有活，轮着看 */
int main(void)
{
    while (1) {
        check_key();      /* 处理按键要 200ms          */
        check_uart();     /* 串口数据来了也得等上面做完 */
        refresh_lcd();
    }
}

/* RTOS：每件事一个员工（任务），急事先干 */
void KeyTask(void *p)  { for (;;) { wait_key();  do_key();  } }   /* 优先级 2 */
void UartTask(void *p) { for (;;) { wait_uart(); do_uart(); } }   /* 优先级 3：更急，能打断 KeyTask */
void LcdTask(void *p)  { for (;;) { refresh_lcd(); vTaskDelay(50); } } /* 优先级 1 */

int main(void)
{
    xTaskCreate(KeyTask,  "key",  128, NULL, 2, NULL);   /* 招三个员工 */
    xTaskCreate(UartTask, "uart", 128, NULL, 3, NULL);
    xTaskCreate(LcdTask,  "lcd",  128, NULL, 1, NULL);
    vTaskStartScheduler();                               /* 老板开始排班，永不返回 */
}`,
},
{
id:'task-states', group:'基础概念', title:'任务的四种状态',
one:'任务只有四种状态：正在干（运行）、排队等干（就绪）、在等东西（阻塞）、被叫停（挂起）。',
analogy:'员工要么在干活，要么站着等老板叫，要么在等快递来（快递到了自动醒），要么被老板停职（老板不说复工就一直停）。',
qa:[
 {q:'阻塞和挂起有什么区别？', a:'<b>阻塞</b>是自己在等一件事（延时到、数据来），事到了内核自动叫醒它。\n<b>挂起</b>是被人强制停掉，内核不会自动恢复，必须有人调 vTaskResume。'},
 {q:'哪些函数会让任务阻塞？', a:'vTaskDelay（等时间）、xQueueReceive（等数据）、xSemaphoreTake（等信号）……凡是"等"的函数都会。'},
],
note:'点"步进"，看右侧任务表里 TaskA 的状态变化：运行 → 阻塞 → 就绪 → 运行 → 挂起，TaskB 每 6 tick 把它叫醒一次。',
code:`TaskHandle_t TaskAHandle;

void vTaskA(void *p)                 /* 优先级 2 */
{
    for (;;) {
        printf("A running\\n");       /* 运行 */
        vTaskDelay(3);                /* 阻塞：睡 3 个 tick，到点自动醒 */
        vTaskSuspend(NULL);           /* 挂起：把自己停掉，等别人叫 */
        printf("A resumed\\n");
    }
}

void vTaskB(void *p)                 /* 优先级 1 */
{
    for (;;) {
        vTaskDelay(6);
        vTaskResume(TaskAHandle);     /* 叫醒 A，A 优先级高，立刻抢过 CPU */
    }
}`,
sim:{ vars:[['TaskAHandle','TaskHandle_t',0]],
 tasks:[
  {name:'TaskA',prio:2,stack:256,run:function*(k,m){ for(;;){ yield k.printf('printf("A running','A running'); yield k.delay('vTaskDelay(3)',3); yield k.suspend('vTaskSuspend(NULL)',null); yield k.printf('printf("A resumed','A resumed'); } }},
  {name:'TaskB',prio:1,stack:256,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(6)',6); yield k.resume('vTaskResume(TaskAHandle)','TaskA'); } }},
 ]},
},
{
id:'priority', group:'基础概念', title:'优先级与抢占',
one:'数字越大越急。急的任务一有活干，立刻把不急的踢下 CPU，这叫抢占。',
analogy:'手术室里主任医生（高优先级）一开口，实习生（低优先级）手头的活马上停下。主任休息时实习生才能干活。',
qa:[
 {q:'优先级在哪里定？', a:'不在任务函数里，而是在 <b>xTaskCreate 的第 5 个参数</b>。任务函数只是一段普通代码，急不急是老板（调度器）招人时定的。看代码最下面的 main()。'},
 {q:'调度规则？', a:'只有两条：<b>1.</b> 永远让最急的就绪任务运行；<b>2.</b> 一样急的轮流跑。'},
 {q:'高优先级任务一直不休息会怎样？', a:'下面的任务永远没机会跑，叫"饥饿"。所以每个任务都必须有"等"的时候（延时、等数据），把 CPU 让出来。'},
 {q:'优先级怎么分？', a:'越等不起的越高：通信、控制最高，显示、日志最低。'},
],
note:'High 每 4 tick 醒一次，一醒就把 Low 踢下去。看下面的 CPU 时间线：绿色被蓝色规律地打断。',
code:`int counter = 0;

void vLowTask(void *p)               /* 优先级 1：一直有活干 */
{
    for (;;) {
        counter++;                    /* 只能捡 High 睡觉的时间跑 */
    }
}

void vHighTask(void *p)              /* 优先级 3 */
{
    for (;;) {
        vTaskDelay(4);                /* 睡 4 tick，让出 CPU */
        printf("High preempts!\\n");  /* 一醒来立刻抢占 */
    }
}`,
sim:{ vars:[['counter','int',0]],
 tasks:[
  {name:'Low',prio:1,run:function*(k,m){ for(;;){ yield k.exec('counter++',m=>m.set('counter',m.get('counter')+1)); } }},
  {name:'High',prio:3,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(4)',4); yield k.printf('printf("High preempts','High preempts!'); } }},
 ]},
},
{
id:'time-slice', group:'基础概念', title:'同优先级：时间片轮流',
one:'两个任务一样急，就每个 tick 换一次人，轮着跑。',
analogy:'两个同级员工共用一台电脑，闹钟每响一次（tick）就换人。',
qa:[
 {q:'tick 是什么？', a:'系统的心跳，通常 1 毫秒一次。每次心跳内核都会看一眼：要不要换人？'},
 {q:'taskYIELD 是什么？', a:'"我先让让"。任务主动把剩下的时间片让给同级的其它任务。'},
],
note:'A、B 都是优先级 1，从不休息。看时间线：一格绿一格蓝交替。B 每加到 5 的倍数就主动让一次。',
code:`int a = 0, b = 0;

void vTaskA(void *p)                 /* 优先级 1 */
{
    for (;;) {
        a++;                          /* 每个 tick 被切走一次 */
    }
}

void vTaskB(void *p)                 /* 优先级 1 */
{
    for (;;) {
        b++;
        if (b % 5 == 0) taskYIELD();  /* 主动让一让 */
    }
}`,
sim:{ vars:[['a','int',0],['b','int',0]],
 tasks:[
  {name:'TaskA',prio:1,run:function*(k,m){ for(;;){ yield k.exec('a++',m=>m.set('a',m.get('a')+1)); } }},
  {name:'TaskB',prio:1,run:function*(k,m){ for(;;){ yield k.exec('b++',m=>m.set('b',m.get('b')+1)); if(m.get('b')%5===0) yield k.yield('taskYIELD()'); } }},
 ]},
},
{
id:'task-create', group:'基础概念', title:'创建任务时发生了什么',
one:'创建一个任务 = 给它一张"档案卡"（TCB）和一张"草稿纸"（栈），两者都要占内存。',
analogy:'招一个员工，要建一份档案（姓名、级别、干到哪了）和发一个笔记本（记临时数据）。档案和本子可以从公司仓库领（动态），也可以员工自带（静态）。',
qa:[
 {q:'动态和静态创建有什么区别？', a:'<b>动态</b> xTaskCreate：档案和本子从内核的堆里分配，堆不够就创建失败。\n<b>静态</b> xTaskCreateStatic：你自己准备好全局数组给它用，不依赖堆，不会失败。'},
 {q:'最容易踩的坑？', a:'栈大小的单位是<b>"字"不是字节</b>。写 128 实际是 512 字节。'},
 {q:'任务函数能 return 吗？', a:'不能，会跑飞。要结束就调 vTaskDelete(NULL)。'},
],
note:'看右侧：句柄 DynHandle 的值就是档案卡（TCB）在堆里的地址。pvPortMalloc 时堆用量涨，vPortFree 时降。',
code:`TaskHandle_t DynHandle;
uint8_t *pBuf;

void vDynTask(void *p)
{
    for (;;) {
        pBuf = pvPortMalloc(1024);    /* 从堆里借 1024 字节 */
        printf("malloc ok\\n");
        vPortFree(pBuf);              /* 还回去 */
        vTaskDelay(3);
    }
}

void vStaticTask(void *p) { for (;;) { vTaskDelay(5); } }

static StaticTask_t  tcb;            /* 静态任务自带的档案卡 */
static StackType_t   stack[128];     /* 静态任务自带的草稿纸 */

int main(void)
{
    xTaskCreate(vDynTask, "dyn", 128, NULL, 2, &DynHandle);          /* 128 字 = 512 字节 */
    xTaskCreateStatic(vStaticTask, "st", 128, NULL, 1, stack, &tcb);
    vTaskStartScheduler();
}`,
sim:{ heap:4096, vars:[['DynHandle','TaskHandle_t',0],['pBuf','uint8_t *',0]],
 tasks:[
  {name:'Dyn',prio:2,run:function*(k,m){ for(;;){ yield k.malloc('pvPortMalloc(1024)','pBuf',1024); yield k.printf('printf("malloc ok','malloc ok'); yield k.free('vPortFree(pBuf)','pBuf'); yield k.delay('vTaskDelay(3)',3); } }},
  {name:'Static',prio:1,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(5)',5); } }},
 ]},
},
{
id:'context-switch', group:'基础概念', title:'任务切换时发生了什么',
one:'切换 = 把当前任务的寄存器存到它的栈上，再从下一个任务的栈上把寄存器取出来。',
analogy:'两个人轮流用一张桌子。换人时，前一个人把桌上的东西装进自己的箱子（压栈），后一个人从自己的箱子里把东西摆回桌上（出栈）。',
qa:[
 {q:'谁来做这件事？', a:'Cortex-M 上由 <b>PendSV</b> 中断做。SysTick（心跳）只负责判断"该换人了"，然后触发 PendSV。'},
 {q:'为什么放在 PendSV 里？', a:'PendSV 优先级设成最低，保证其它中断都处理完了才切换，不会切到一半被别的中断搅乱。'},
 {q:'存了哪些寄存器？', a:'进中断时硬件<b>自动</b>存 8 个（R0-R3、R12、LR、PC、xPSR），PendSV 里软件<b>手动</b>再存 8 个（R4-R11）。栈指针 SP 存在档案卡（TCB）第一格。'},
],
code:`/* PendSV 中断，简化成 5 步 */
void PendSV_Handler(void)
{
    /* 1. 硬件已自动把 R0-R3,R12,LR,PC,xPSR 压到当前任务栈 */
    push(R4..R11);                    /* 2. 软件再压剩下的 8 个 */
    currentTCB->sp = SP;              /* 3. 栈顶位置记到档案卡 */

    vTaskSwitchContext();             /* 4. 选下一个任务，改 currentTCB */

    SP = currentTCB->sp;              /* 5. 换成新任务的栈 */
    pop(R4..R11);                     /*    取回它的寄存器 */
    return;                           /*    硬件自动弹出剩下 8 个，任务接着跑 */
}

/* 心跳中断只判断，不切换 */
void SysTick_Handler(void)
{
    if (xTaskIncrementTick())         /* 有更急的任务醒了？ */
        trigger_PendSV();             /* 触发 PendSV 去换人 */
}`,
},
{
id:'delay', group:'基础概念', title:'vTaskDelay 和 vTaskDelayUntil',
one:'vTaskDelay 是"从现在起睡 n"，vTaskDelayUntil 是"睡到上次醒来的时刻 + n"。',
analogy:'前者像"干完活再睡 5 分钟"，干活越久周期越长；后者像"每逢整点起来"，不管干活多久，周期不变。',
qa:[
 {q:'各用在哪？', a:'<b>vTaskDelay</b>：随便等一等，周期不重要。\n<b>vTaskDelayUntil</b>：要求固定周期，比如每 10ms 采一次样。'},
 {q:'面试常追问？', a:'vTaskDelayUntil 如果干活时间超过了周期，唤醒点已经过去，它不会睡，直接返回。'},
],
note:'两个任务干活都要 2 tick。看变量：periodA 是 7（2+5），periodB 平均是 5。',
code:`int periodA, periodB;

void vTaskA(void *p)                 /* 用 vTaskDelay */
{
    for (;;) {
        work();                       /* 干活 2 tick */
        vTaskDelay(5);                /* 再睡 5 → 周期变成 7 */
    }
}

void vTaskB(void *p)                 /* 用 vTaskDelayUntil */
{
    TickType_t last = xTaskGetTickCount();
    for (;;) {
        work();                       /* 干活 2 tick */
        vTaskDelayUntil(&last, 5);    /* 睡到 上次醒来+5 → 周期恒为 5 */
    }
}`,
sim:{ vars:[['periodA','int',0],['periodB','int',0],['lastA','int',0],['lastB','int',0]],
 tasks:[
  {name:'TaskA',prio:3,run:function*(k,m){ for(;;){ yield k.exec('work();#1',(m,t,s)=>{ m.set('periodA',s.tick-m.get('lastA')); m.set('lastA',s.tick); }); yield k.L('work();#1'); yield k.delay('vTaskDelay(5)',5); } }},
  {name:'TaskB',prio:2,run:function*(k,m){ yield k.L('xTaskGetTickCount()'); for(;;){ yield k.exec('work();#2',(m,t,s)=>{ m.set('periodB',s.tick-m.get('lastB')); m.set('lastB',s.tick); }); yield k.L('work();#2'); yield k.delayUntil('vTaskDelayUntil(&last, 5)',5); } }},
 ]},
},
{
id:'idle', group:'基础概念', title:'空闲任务',
one:'没人干活时跑的那个任务，优先级 0，系统自动创建。它顺便帮忙回收垃圾、让 CPU 睡觉。',
analogy:'公司里的保洁员：大家都下班了才干活，负责清理被辞退员工留下的东西，没事就打盹省电。',
qa:[
 {q:'空闲钩子能干什么？', a:'让 CPU 进低功耗睡眠、统计 CPU 空闲率。'},
 {q:'空闲钩子里绝对不能干什么？', a:'<b>不能调用会阻塞的函数</b>（比如 vTaskDelay）。它是最后的保底任务，它一睡系统就没任务可跑了。'},
],
note:'只有一个任务，每 5 tick 醒一次，其余时间全是空闲任务在 __WFI() 睡觉。看时间线的灰色格。',
code:`void vApplicationIdleHook(void)       /* 空闲钩子，没人干活时被反复调用 */
{
    __WFI();                          /* CPU 睡觉，等中断唤醒 */
    /* 这里不能 vTaskDelay！ */
}

void vSensorTask(void *p)            /* 优先级 2 */
{
    for (;;) {
        read_sensor();
        vTaskDelay(5);                /* 睡觉期间只剩空闲任务 */
    }
}`,
sim:{ idleHook:function*(k,m){ yield k.sleep('__WFI();'); },
 tasks:[ {name:'Sensor',prio:2,run:function*(k,m){ for(;;){ yield k.printf('read_sensor();','读取传感器'); yield k.delay('vTaskDelay(5)',5); } }} ]},
},
{
id:'task-delete', group:'基础概念', title:'删除任务，内存什么时候还回来',
one:'删别人：立刻还。删自己：自己还站在自己的栈上，只能等空闲任务来收。',
analogy:'辞退别人可以马上收回他的桌子；自己辞职时人还坐在桌前，得等保洁员（空闲任务）来收拾。',
qa:[
 {q:'所以空闲任务被饿死会怎样？', a:'删掉自己的任务的内存永远收不回来，内存慢慢漏光。'},
 {q:'任务自己申请的内存、拿着的锁呢？', a:'内核不管，删之前自己释放，否则漏内存或别人永远拿不到锁。'},
],
note:'Worker 干 3 步活后删除自己。看堆用量：要等 IDLE 跑到才减少。',
code:`int freeHeap;

void vWorkerTask(void *p)            /* 优先级 2，干完就走 */
{
    do_job();
    do_job();
    do_job();
    vTaskDelete(NULL);                /* 删自己：内存等空闲任务来收 */
}

void vMonitorTask(void *p)           /* 优先级 1 */
{
    for (;;) {
        freeHeap = xPortGetFreeHeapSize();
        vTaskDelay(2);                /* 睡觉，让空闲任务有机会跑 */
    }
}`,
sim:{ vars:[['freeHeap','int',0]],
 tasks:[
  {name:'Worker',prio:2,stack:512,run:function*(k,m){ yield k.L('do_job();#1'); yield k.L('do_job();#2'); yield k.L('do_job();#3'); yield k.del('vTaskDelete(NULL)',null); }},
  {name:'Monitor',prio:1,run:function*(k,m){ for(;;){ yield k.exec('xPortGetFreeHeapSize()',(m,t,s)=>m.set('freeHeap',s.heapSize-s.heapUsed)); yield k.delay('vTaskDelay(2)',2); } }},
 ]},
},
// ============ 同步与通信 ============
{
id:'queue', group:'同步与通信', title:'队列：任务之间传数据',
one:'队列是一条传送带：一头放，一头取，先放的先取，满了放不进，空了取不到。',
analogy:'餐厅的出菜口。厨师放菜，服务员取菜。出菜口只能放 3 盘，满了厨师要么等，要么把菜倒掉。',
qa:[
 {q:'队列满了怎么办？', a:'发送时给一个"等多久"：<b>0</b> 立刻放弃，<b>n</b> 最多等 n 个 tick，<b>portMAX_DELAY</b> 一直等。'},
 {q:'项目里怎么处理？', a:'关键数据：带超时等，失败了计数报警。不重要的数据（传感器采样）：直接覆盖旧的。'},
 {q:'队列传的是什么？', a:'是<b>拷贝</b>，不是指针。大数据传指针就行。'},
],
note:'生产者每 tick 放一个，消费者每 3 tick 取一个。队列长度 3，很快满了，dropped 开始涨。',
code:`QueueHandle_t xQueue;                /* 长度 3 */
int txVal = 0, rxVal = 0, dropped = 0;

void vProducer(void *p)              /* 优先级 1 */
{
    for (;;) {
        txVal++;
        if (xQueueSend(xQueue, &txVal, 0) != pdPASS)   /* 等 0：满了立刻放弃 */
            dropped++;
    }
}

void vConsumer(void *p)              /* 优先级 2 */
{
    for (;;) {
        xQueueReceive(xQueue, &rxVal, portMAX_DELAY);  /* 空了就等 */
        process(rxVal);
        vTaskDelay(3);
    }
}`,
sim:{ vars:[['xQueue','QueueHandle_t',0],['txVal','int',0],['rxVal','int',0],['dropped','int',0]], objs:[{kind:'queue',name:'xQueue',len:3}],
 tasks:[
  {name:'Producer',prio:1,run:function*(k,m){ for(;;){ yield k.exec('txVal++',m=>m.set('txVal',m.get('txVal')+1)); const ok = yield k.qSend('xQueueSend(xQueue, &txVal, 0)','xQueue',m=>m.get('txVal'),0); if(!ok) yield k.exec('dropped++',m=>m.set('dropped',m.get('dropped')+1)); } }},
  {name:'Consumer',prio:2,run:function*(k,m){ for(;;){ yield k.qRecv('xQueueReceive(xQueue, &rxVal','xQueue','rxVal',Infinity); yield k.printf('process(rxVal)',m=>'处理 '+m.get('rxVal')); yield k.delay('vTaskDelay(3)',3); } }},
 ]},
},
{
id:'binary-sem', group:'同步与通信', title:'二值信号量：中断叫醒任务',
one:'二值信号量是个门铃：中断按一下（Give），任务听到就起来干活（Take）。',
analogy:'快递员按门铃就走，不进屋；你听到铃声再开门取件。中断做的事只是"按铃"，取件这种耗时的活留给任务。',
qa:[
 {q:'信号量和互斥量差在哪？', a:'<b>信号量</b>是门铃，用来"通知"，谁都能按。\n<b>互斥量</b>是钥匙，用来"占资源"，谁拿的谁还，还带优先级继承。'},
 {q:'门铃按太快会怎样？', a:'你还没开门，第二次按铃没记录，会丢一次。要计数就用计数信号量。'},
],
note:'点"触发中断"：中断按铃后，Handler（优先级 2）立刻醒来抢占 Background。连点两次看第二次被吃掉。',
code:`SemaphoreHandle_t xSem;             /* 门铃 */
int handled = 0, bg = 0;

void EXTI_IRQHandler(void)           /* 中断：只按铃 */
{
    BaseType_t woken = pdFALSE;
    xSemaphoreGiveFromISR(xSem, &woken);
    portYIELD_FROM_ISR(woken);        /* 有人被叫醒就立刻切过去 */
}

void vHandlerTask(void *p)           /* 优先级 2：听铃干活 */
{
    for (;;) {
        xSemaphoreTake(xSem, portMAX_DELAY);   /* 没铃声就睡 */
        handled++;
        heavy_work();                 /* 耗时的活放这里 */
    }
}

void vBackgroundTask(void *p) { for (;;) { bg++; } }   /* 优先级 1 */`,
sim:{ vars:[['xSem','SemaphoreHandle_t',0],['handled','int',0],['bg','int',0],['xHigherPriorityTaskWoken','BaseType_t',0]], objs:[{kind:'sem',name:'xSem'}],
 isr:{name:'EXTI_IRQHandler',run:function*(k,m){ yield k.exec('BaseType_t woken',m=>m.set('xHigherPriorityTaskWoken',0)); yield k.semGiveISR('xSemaphoreGiveFromISR','xSem','xHigherPriorityTaskWoken'); yield k.yieldFromISR('portYIELD_FROM_ISR','xHigherPriorityTaskWoken'); }},
 tasks:[
  {name:'Handler',prio:2,run:function*(k,m){ for(;;){ yield k.semTake('xSemaphoreTake(xSem','xSem',Infinity); yield k.exec('handled++',m=>m.set('handled',m.get('handled')+1)); yield k.L('heavy_work()'); } }},
  {name:'Background',prio:1,run:function*(k,m){ for(;;){ yield k.exec('bg++',m=>m.set('bg',m.get('bg')+1)); } }},
 ]},
},
{
id:'counting-sem', group:'同步与通信', title:'计数信号量：数资源',
one:'计数信号量是一把"几个坑位"的计数器：拿一个减一，还一个加一，为 0 就等。',
analogy:'停车场有 2 个车位。来车就占一个，走车就空一个，满了后面的车排队等。',
qa:[
 {q:'两种用法？', a:'<b>数资源</b>：初值 = 资源数量（2 个 DMA 通道）。\n<b>数事件</b>：初值 0，每次事件加一，不会像二值信号量那样丢。'},
 {q:'能当锁用吗？', a:'保护单个资源请用互斥量，计数信号量没有优先级继承。'},
],
note:'2 个 DMA 通道，3 个任务抢，第三个只能等。',
code:`SemaphoreHandle_t xDma;             /* xSemaphoreCreateCounting(2, 2)：2 个车位 */
int inUse = 0;

void vUserTask(void *p)              /* U1、U2、U3 三个任务都跑这段 */
{
    for (;;) {
        xSemaphoreTake(xDma, portMAX_DELAY);   /* 占一个车位，没有就等 */
        inUse++;
        dma_transfer();
        dma_transfer();
        dma_transfer();
        inUse--;
        xSemaphoreGive(xDma);         /* 还车位 */
        vTaskDelay(2);
    }
}`,
sim:{ vars:[['xDma','SemaphoreHandle_t',0],['inUse','int',0]], objs:[{kind:'csem',name:'xDma',max:2,init:2}],
 tasks:['U1','U2','U3'].map(n=>({name:n,prio:1,run:function*(k,m){ for(;;){ yield k.semTake('xSemaphoreTake(xDma','xDma',Infinity); yield k.exec('inUse++',m=>m.set('inUse',m.get('inUse')+1)); yield k.L('dma_transfer();#1'); yield k.L('dma_transfer();#2'); yield k.L('dma_transfer();#3'); yield k.exec('inUse--',m=>m.set('inUse',m.get('inUse')-1)); yield k.semGive('xSemaphoreGive(xDma)','xDma'); yield k.delay('vTaskDelay(2)',2); } }}))
 },
},
{
id:'mutex', group:'同步与通信', title:'互斥量与优先级继承',
one:'互斥量是一把钥匙：谁拿了谁用，用完谁还。等钥匙的人如果更急，拿钥匙的人会被临时提级，好快点还。',
analogy:'厕所只有一把钥匙。实习生拿着，经理在门口等。为了让经理少等，公司临时给实习生"经理待遇"，这样没人能插队打扰他，他上完立刻还钥匙。',
qa:[
 {q:'优先级继承到底做了什么？', a:'高优先级任务等锁时，把<b>持锁的低优先级任务临时提到自己的级别</b>，让它不被中间的任务打断，尽快释放锁。释放后优先级恢复。'},
 {q:'互斥量能在中断里用吗？', a:'不能。中断不是任务，没法"拿钥匙"，也没法等。'},
],
note:'Low 先拿到锁；High 来等锁，Low 立刻被提到 3；Mid 醒来却抢不过被提级的 Low。看任务表里 Low 的优先级显示"继承"。对比下一考点。',
code:`SemaphoreHandle_t xMutex;           /* 钥匙 */
int shared = 0, mWork = 0;

void vLowTask(void *p)               /* 优先级 1 */
{
    for (;;) {
        xSemaphoreTake(xMutex, portMAX_DELAY);
        shared++;                     /* 拿着钥匙干 4 步 */
        shared++;
        shared++;
        shared++;
        xSemaphoreGive(xMutex);       /* 还钥匙，优先级恢复 1 */
        vTaskDelay(10);
    }
}

void vMidTask(void *p)               /* 优先级 2：与锁无关 */
{
    for (;;) { vTaskDelay(2); mWork++; mWork++; mWork++; mWork++; }
}

void vHighTask(void *p)              /* 优先级 3 */
{
    for (;;) {
        vTaskDelay(1);
        xSemaphoreTake(xMutex, portMAX_DELAY);   /* Low 拿着 → 等，Low 被提到 3 */
        shared++;
        xSemaphoreGive(xMutex);
        vTaskDelay(10);
    }
}`,
sim:{ vars:[['xMutex','SemaphoreHandle_t',0],['shared','int',0],['mWork','int',0]], objs:[{kind:'mutex',name:'xMutex'}],
 tasks:[
  {name:'Low',prio:1,run:function*(k,m){ for(;;){ yield k.semTake('xSemaphoreTake(xMutex, portMAX_DELAY);#1','xMutex',Infinity); for(let i=1;i<=4;i++) yield k.exec('shared++;#'+i,m=>m.set('shared',m.get('shared')+1)); yield k.semGive('xSemaphoreGive(xMutex);       /* 还','xMutex'); yield k.delay('vTaskDelay(10);#1',10); } }},
  {name:'Mid',prio:2,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(2)',2); for(let i=0;i<4;i++) yield k.exec('mWork++;',m=>m.set('mWork',m.get('mWork')+1)); } }},
  {name:'High',prio:3,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(1);',1); yield k.semTake('xSemaphoreTake(xMutex, portMAX_DELAY);   /* Low','xMutex',Infinity); yield k.exec('shared++;#5',m=>m.set('shared',m.get('shared')+1)); yield k.semGive('xSemaphoreGive(xMutex);#2','xMutex'); yield k.delay('vTaskDelay(10);#2',10); } }},
 ]},
},
{
id:'inversion', group:'同步与通信', title:'优先级反转',
one:'高优先级等低优先级的锁，低优先级又被中优先级抢走，结果高优先级排在中优先级后面，这就是反转。',
analogy:'经理等实习生还钥匙，实习生被主管叫去干别的活，经理只能干等主管的活做完。经理反而排在了主管后面。',
qa:[
 {q:'怎么解决？', a:'用<b>互斥量</b>（自带优先级继承），别用二值信号量当锁。锁里面的活越短越好。'},
 {q:'有名的事故？', a:'1997 年火星探路者反复重启，就是优先级反转。'},
],
note:'和上一考点代码一样，只是把互斥量换成了二值信号量。没有优先级继承，Mid 在 tick 2 抢走 Low，High 被迫等 Mid 干完。对比两个考点的时间线。',
code:`SemaphoreHandle_t xSem;             /* 错误示范：用二值信号量当锁 */
int shared = 0, mWork = 0;

void vLowTask(void *p)               /* 优先级 1 */
{
    for (;;) {
        xSemaphoreTake(xSem, portMAX_DELAY);
        shared++;
        shared++;
        shared++;
        shared++;
        xSemaphoreGive(xSem);
        vTaskDelay(10);
    }
}

void vMidTask(void *p)               /* 优先级 2：无辜地拖住了 High */
{
    for (;;) { vTaskDelay(2); mWork++; mWork++; mWork++; mWork++; }
}

void vHighTask(void *p)              /* 优先级 3 */
{
    for (;;) {
        vTaskDelay(1);
        xSemaphoreTake(xSem, portMAX_DELAY);     /* 等 Low，Low 却被 Mid 抢了 */
        shared++;
        xSemaphoreGive(xSem);
        vTaskDelay(10);
    }
}`,
sim:{ vars:[['xSem','SemaphoreHandle_t',0],['shared','int',0],['mWork','int',0]], objs:[{kind:'sem',name:'xSem',init:1}],
 tasks:[
  {name:'Low',prio:1,run:function*(k,m){ for(;;){ yield k.semTake('xSemaphoreTake(xSem, portMAX_DELAY);#1','xSem',Infinity); for(let i=1;i<=4;i++) yield k.exec('shared++;#'+i,m=>m.set('shared',m.get('shared')+1)); yield k.semGive('xSemaphoreGive(xSem);#1','xSem'); yield k.delay('vTaskDelay(10);#1',10); } }},
  {name:'Mid',prio:2,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(2)',2); for(let i=0;i<4;i++) yield k.exec('mWork++;',m=>m.set('mWork',m.get('mWork')+1)); } }},
  {name:'High',prio:3,run:function*(k,m){ for(;;){ yield k.delay('vTaskDelay(1);',1); yield k.semTake('xSemaphoreTake(xSem, portMAX_DELAY);     /*','xSem',Infinity); yield k.exec('shared++;#5',m=>m.set('shared',m.get('shared')+1)); yield k.semGive('xSemaphoreGive(xSem);#2','xSem'); yield k.delay('vTaskDelay(10);#2',10); } }},
 ]},
},
{
id:'recursive-mutex', group:'同步与通信', title:'递归互斥量',
one:'普通锁自己拿两次会把自己锁死；递归锁允许同一个任务反复拿，拿几次就要还几次。',
analogy:'你拿着钥匙进了门，屋里还有一道门用同一把钥匙。普通钥匙会说"钥匙已经被拿走了"（被你自己），递归钥匙会记"你拿了两次"。',
qa:[
 {q:'什么时候会碰到？', a:'函数 A 加锁后调用函数 B，B 里也加同一把锁。'},
 {q:'该不该用？', a:'能拆锁就别用，它掩盖了设计问题。'},
],
note:'write_log 里又调 flush_log，两个都加锁。看内核对象区的"递归深度"1 → 2 → 1 → 0。',
code:`SemaphoreHandle_t xRMutex;          /* 递归钥匙 */

void flush_log(void)
{
    xSemaphoreTakeRecursive(xRMutex, portMAX_DELAY);  /* 深度 1 → 2 */
    uart_send();
    xSemaphoreGiveRecursive(xRMutex);                 /* 深度 2 → 1 */
}

void write_log(void)
{
    xSemaphoreTakeRecursive(xRMutex, portMAX_DELAY);  /* 深度 0 → 1 */
    format();
    flush_log();                                      /* 里面再拿一次，不会死锁 */
    xSemaphoreGiveRecursive(xRMutex);                 /* 深度 1 → 0，真正还了 */
}

void vLogTask(void *p)   { for (;;) { write_log(); vTaskDelay(3); } }
void vOtherTask(void *p) { for (;;) { write_log(); vTaskDelay(4); } }`,
sim:{ vars:[['xRMutex','SemaphoreHandle_t',0]], objs:[{kind:'rmutex',name:'xRMutex'}],
 tasks:[
  ...[['Log',3],['Other',4]].map(([n,d])=>({name:n,prio:1,run:function*(k,m){ for(;;){ yield k.semTake('深度 0 → 1','xRMutex',Infinity); yield k.L('format();'); yield k.L('flush_log();  '); yield k.semTake('深度 1 → 2','xRMutex',Infinity); yield k.L('uart_send();'); yield k.semGive('深度 2 → 1','xRMutex'); yield k.semGive('深度 1 → 0','xRMutex'); yield k.delay('vTaskDelay('+d+')',d); } }}))
 ]},
},
{
id:'deadlock', group:'同步与通信', title:'死锁',
one:'两个任务各拿一把锁，又都在等对方那把，谁也不放手，永远卡住。',
analogy:'两个人过独木桥，一人拿着左边的通行证等右边的，另一人拿着右边的等左边的，都不肯先退。',
qa:[
 {q:'怎么避免？', a:'<b>1.</b> 所有任务按同一顺序拿锁（都先 A 后 B）。\n<b>2.</b> 等锁带超时，超时就把手里的锁放掉重来。\n<b>3.</b> 一个任务尽量只拿一把锁。'},
],
note:'跑几步后 T1、T2 都变成"阻塞"且永远不会醒，只剩 IDLE 在跑，日志报出死锁。把 T2 改成先拿 A 再拿 B 就没事。',
code:`SemaphoreHandle_t xA, xB;           /* 两把钥匙 */

void vTask1(void *p)                 /* 先 A 后 B */
{
    for (;;) {
        xSemaphoreTake(xA, portMAX_DELAY);
        xSemaphoreTake(xB, portMAX_DELAY);   /* B 在 T2 手里… */
        use_both();
        xSemaphoreGive(xB);
        xSemaphoreGive(xA);
    }
}

void vTask2(void *p)                 /* 先 B 后 A：顺序反了 */
{
    for (;;) {
        xSemaphoreTake(xB, portMAX_DELAY);
        xSemaphoreTake(xA, portMAX_DELAY);   /* A 在 T1 手里… 死锁 */
        use_both();
        xSemaphoreGive(xA);
        xSemaphoreGive(xB);
    }
}`,
sim:{ vars:[['xA','SemaphoreHandle_t',0],['xB','SemaphoreHandle_t',0]], objs:[{kind:'mutex',name:'xA'},{kind:'mutex',name:'xB'}],
 tasks:[
  {name:'T1',prio:1,run:function*(k,m){ for(;;){ yield k.semTake('xSemaphoreTake(xA, portMAX_DELAY);#1','xA',Infinity); yield k.semTake('B 在 T2 手里','xB',Infinity); yield k.L('use_both();#1'); yield k.semGive('xSemaphoreGive(xB);#1','xB'); yield k.semGive('xSemaphoreGive(xA);#1','xA'); } }},
  {name:'T2',prio:1,run:function*(k,m){ for(;;){ yield k.semTake('xSemaphoreTake(xB, portMAX_DELAY);#2','xB',Infinity); yield k.semTake('A 在 T1 手里','xA',Infinity); yield k.L('use_both();#2'); yield k.semGive('xSemaphoreGive(xA);#2','xA'); yield k.semGive('xSemaphoreGive(xB);#2','xB'); } }},
 ],
 idleHook:function*(k,m){ yield k.exec(null,(m,t,s)=>{ const dead=s.tasks.filter(x=>x.state==='BLOCKED'&&x.wakeTick==null&&x.waitObj&&x.waitObj.holder&&x.waitObj.holder.state==='BLOCKED'); if(dead.length>=2&&!s._dl){ s._dl=true; s.klog('死锁：'+dead.map(x=>x.name+' 等 '+x.waitObj.name+'（在 '+x.waitObj.holder.name+' 手里）').join('；'),'e'); } }); }
 },
},
];
