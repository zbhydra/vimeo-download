"""
单例模式装饰器

提供线程安全的单例装饰器，其他类使用此装饰器即可成为单例类。
"""

import threading
from typing import Any, Dict, Type, TypeVar

T = TypeVar("T")


def singleton(cls: Type[T]) -> Type[T]:
    """
    单例装饰器

    使用装饰器模式将普通类转换为单例类

    示例:
    ```python
    @singleton
    class MyService:
        def __init__(self):
            self.data = []

    # 创建实例
    service1 = MyService()
    service2 = MyService()

    # service1 和 service2 是同一个实例
    assert service1 is service2
    ```
    """
    # 这个字典其实没吊用，都是每个类都是闭包里面的变量
    instances: Dict[Type[T], T] = {}
    lock = threading.Lock()

    def get_instance(*args: Any, **kwargs: Any) -> T:
        if cls not in instances:
            with lock:
                if cls not in instances:
                    instances[cls] = cls(*args, **kwargs)
        return instances[cls]

    return get_instance  # type: ignore[return-value]
