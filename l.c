#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <errno.h>

#define ITERATIONS 20
#define DELAY_COUNT 100000000

// Структура, которая будет храниться в разделяемой памяти
struct SharedTimer {
    int global_time;          // общее время
    int last_timer1_update;   // последнее значение, записанное timer1
    int last_timer2_update;   // последнее значение, записанное timer2
};

// Искусственная задержка
void delay() {
    volatile long i;
    for (i = 0; i < DELAY_COUNT; i++);
}

int main() {
    key_t key;                 // IPC-ключ
    int shmid;                 // идентификатор сегмента разделяемой памяти
    struct SharedTimer *timer; // указатель на структуру в общей памяти
    int created = 0;           // флаг: был ли сегмент создан именно этой программой

    // Генерация ключа IPC
    // Используем имя файла timer1.c и символ 'T'
    key = ftok("timer1.c", 'T');
    if (key == -1) {
        perror("ftok");
        exit(EXIT_FAILURE);
    }
    printf("TIMER1 [PID=%d]: ключ = 0x%x\n", getpid(), key);

    // Пытаемся создать новый сегмент памяти
    // Если он уже существует, просто подключимся к нему
    shmid = shmget(key, sizeof(struct SharedTimer), 0666 | IPC_CREAT | IPC_EXCL);
    if (shmid == -1) {
        if (errno == EEXIST) {
            printf("TIMER1 [PID=%d]: сегмент уже существует, подключаюсь\n", getpid());

            // Если сегмент уже есть, просто получаем доступ к существующему
            shmid = shmget(key, sizeof(struct SharedTimer), 0);
            if (shmid == -1) {
                perror("shmget");
                exit(EXIT_FAILURE);
            }
        } 
        else {
            perror("shmget");
            exit(EXIT_FAILURE);
        }
    } 
    else {
        created = 1;
        printf("TIMER1 [PID=%d]: создан новый сегмент памяти\n", getpid());
    }

    // Присоединяем сегмент памяти к адресному пространству процесса
    timer = (struct SharedTimer *)shmat(shmid, NULL, 0);
    if (timer == (struct SharedTimer *)-1) {
        perror("shmat");
        exit(EXIT_FAILURE);
    }

    // Если сегмент только что создан, инициализируем данные нулями
    if (created) {
        timer->global_time = 0;
        timer->last_timer1_update = 0;
        timer->last_timer2_update = 0;

        printf("TIMER1 [PID=%d]: структура таймера инициализирована нулями\n", getpid());
    }

    // Основной цикл: 20 раз пытаемся увеличить global_time
    for (int i = 0; i < ITERATIONS; i++) {
        int temp;

        // Считываем текущее значение общего времени в локальную переменную
        temp = timer->global_time;

        printf("TIMER1 [PID=%d]: итерация %d, прочитано global_time = %d\n",
               getpid(), i + 1, temp);

        // Делаем задержку
        delay();

        // Увеличиваем локальную копию
        temp = temp + 1;
        delay();

        // Записываем результат обратно в общую память
        timer->global_time = temp;

        // 6. Это значение записал timer1
        timer->last_timer1_update = temp;

        printf("TIMER1 [PID=%d]: итерация %d, записано global_time = %d\n",
               getpid(), i + 1, temp);
    }

    // Вывод итогового состояния после завершения работы timer1
    printf("TIMER1 [PID=%d]: итог: global_time = %d, last_timer1_update = %d, last_timer2_update = %d\n",
           getpid(),
           timer->global_time,
           timer->last_timer1_update,
           timer->last_timer2_update);

    // Отсоединяем сегмент памяти от процесса
    if (shmdt(timer) == -1) {
        perror("shmdt");
        exit(EXIT_FAILURE);
    }
    printf("TIMER1 [PID=%d]: сегмент отсоединен\n", getpid());
    return 0;
}