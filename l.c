#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

#define ITERATIONS 20
#define DELAY_COUNT 100000000

// Функция искусственной задержки
void delay() {
    volatile long i;
    for (i = 0; i < DELAY_COUNT; i++);
}

int main() {
    key_t key;        
    int shmid;        
    int *counter;     // указатель на общий счетчик в разделяемой памяти

    // Генерация ключа
    // Ключ должен быть таким же, как в progA.c
    // Поэтому используем тот же файл и тот же символ проекта
    key = ftok("progA.c", 'R');
    if (key == -1) {
        perror("ftok");
        exit(EXIT_FAILURE);
    }
    printf("progB [PID=%d]: ключ = 0x%x\n", getpid(), key);

    // Получение доступа к уже существующему сегменту
    shmid = shmget(key, sizeof(int), 0);
    if (shmid == -1) {
        perror("shmget");
        printf("progB [PID=%d]: сегмент не существует, сначала запустите progA\n", getpid());
        exit(EXIT_FAILURE);
    }
    printf("progB [PID=%d]: подключение к существующему сегменту\n", getpid());

    // Присоединение сегмента к адресному пространству процесса
    counter = (int *)shmat(shmid, NULL, 0);
    if (counter == (int *)-1) {
        perror("shmat");
        exit(EXIT_FAILURE);
    }

    // Цикл работы со счетчиком
    // - выводим текущее значение
    // - делаем задержку
    // - увеличиваем счетчик на 1
    // - выводим новое значение
    for (int i = 0; i < ITERATIONS; i++) {
        printf("progB [PID=%d]: итерация %d, текущее значение = %d\n",
               getpid(), i + 1, *counter);

        delay();

        (*counter)++;

        printf("progB [PID=%d]: итерация %d, новое значение = %d\n",
               getpid(), i + 1, *counter);
    }

    // 5. Отсоединение сегмента
    if (shmdt(counter) == -1) {
        perror("shmdt");
        exit(EXIT_FAILURE);
    }

    printf("progB [PID=%d]: сегмент отсоединен\n", getpid());

    return 0;
}