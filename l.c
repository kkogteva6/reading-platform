#include <sys/types.h>
#include <sys/ipc.h>
#include <sys/sem.h>
#include <stdio.h>
#include <stdlib.h>

// структура для semctl
union semun {
    int val;
    struct semid_ds *buf;
    unsigned short *array;
};

int main() {
    key_t key;
    int semid;
    union semun arg;

    // Генерация ключа
    key = ftok("progA.c", 'S');  // отдельный ключ для семафора
    if (key == -1) {
        perror("ftok");
        exit(EXIT_FAILURE);
    }
    printf("Ключ семафора: 0x%x\n", key);

    // Создание массива из 1 семафора
    semid = semget(key, 1, 0666 | IPC_CREAT | IPC_EXCL);
    if (semid == -1) {
        perror("semget");
        exit(EXIT_FAILURE);
    }
    printf("Семафор создан, semid = %d\n", semid);

    // Инициализация значением 1
    arg.val = 1;
    if (semctl(semid, 0, SETVAL, arg) == -1) {
        perror("semctl");
        exit(EXIT_FAILURE);
    }
    printf("Семафор инициализирован значением 1\n");

    return 0;
}