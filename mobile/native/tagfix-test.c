#include <assert.h>
#include <string.h>
#include <stdint.h>
static int mode, sdk = 36, modern_calls, legacy_calls;
static char output[512];
static int modern(int option,int value){assert(option==-204 && value==0);modern_calls++;return mode==1 || mode==4;}
static _Bool legacy(int option,void *arg,unsigned long size){assert(option==8 && size==sizeof(int) && *(int*)arg==0);legacy_calls++;return mode==2;}
static void *allocate(unsigned long size){assert(size==16);return (void*)(uintptr_t)(mode==4 ? 0xab00000000001000ULL : 0x1000ULL);}
static void release(void *pointer){assert(pointer!=0);}
void *dlopen(const char *name,int flags){assert(flags==2);assert(strstr(name,"libc.so"));return (void*)1;}
char *getenv(const char *name){assert(strcmp(name,"JTG_ANDROID_API_LEVEL")==0);return sdk==30 ? "30" : sdk==23 ? "23" : "36";}
void *dlsym(void *handle,const char *name){assert(handle==(void*)1);if(mode==0)return 0;if(!strcmp(name,"mallopt"))return (void*)modern;if(!strcmp(name,"android_mallopt"))return (void*)legacy;if(!strcmp(name,"malloc"))return (void*)allocate;if(!strcmp(name,"free"))return (void*)release;return 0;}
long write(int fd,const void *bytes,unsigned long size){assert(fd==2 && size<sizeof(output));memcpy(output,bytes,size);output[size]=0;return size;}
#include "tagfix.c"
int main(void){
 for(mode=0;mode<=4;mode++){
  sdk=36;modern_calls=legacy_calls=0;output[0]=0;disable_heap_tagging();
  assert((strstr(output,"tagging disabled")!=0)==(mode==1 || mode==2));
  assert((strstr(output,"WARNING")!=0)==(mode==0 || mode==3 || mode==4));
 }
 sdk=30;mode=2;modern_calls=legacy_calls=0;disable_heap_tagging();assert(modern_calls==0 && legacy_calls==1);
 sdk=23;modern_calls=legacy_calls=0;disable_heap_tagging();assert(modern_calls==0 && legacy_calls==0);
 return 0;
}
