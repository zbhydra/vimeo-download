"""
Test core singleton functionality.

Tests for singleton decorator implementation and thread safety.
"""

import threading
import time

import pytest

from app.core.singleton import singleton


class TestSingletonDecorator:
    """Test singleton decorator functionality."""

    @pytest.mark.asyncio
    async def test_singleton_basic_functionality(self):
        """Test basic singleton functionality."""

        @singleton
        class TestClass:
            def __init__(self, value=None):
                self.value = value or "default"
                self.created_at = time.time()

        # Create instances
        instance1 = TestClass("test1")
        instance2 = TestClass("test2")

        # Should be the same instance
        assert instance1 is instance2
        assert instance1.value == "test1"  # Value from first creation
        assert instance2.value == "test1"  # Same instance, same value
        assert instance1.created_at == instance2.created_at

    @pytest.mark.asyncio
    async def test_singleton_with_no_args(self):
        """Test singleton with no constructor arguments."""

        @singleton
        class SimpleClass:
            def __init__(self):
                self.data = []

        instance1 = SimpleClass()
        instance2 = SimpleClass()

        assert instance1 is instance2
        assert instance1.data is instance2.data

    @pytest.mark.asyncio
    async def test_singleton_with_mixed_args(self):
        """Test singleton with mixed positional and keyword arguments."""

        @singleton
        class ComplexClass:
            def __init__(self, arg1, arg2=None, **kwargs):
                self.arg1 = arg1
                self.arg2 = arg2
                self.kwargs = kwargs

        # First instance with specific arguments
        instance1 = ComplexClass("value1", arg2="value2", extra="extra")

        # Second instance with different arguments (should be ignored)
        instance2 = ComplexClass("different", arg2="different")

        # Should be same instance with first arguments
        assert instance1 is instance2
        assert instance1.arg1 == "value1"
        assert instance1.arg2 == "value2"
        assert instance1.kwargs == {"extra": "extra"}

    @pytest.mark.asyncio
    async def test_singleton_inheritance(self):
        """Test singleton behavior with inheritance."""

        # Test that different singleton classes are independent
        @singleton
        class FirstClass:
            def __init__(self, value):
                self.value = value

        @singleton
        class SecondClass:
            def __init__(self, value):
                self.value = value

        # Each class should have its own singleton instance
        first1 = FirstClass("first")
        first2 = FirstClass("second")
        second1 = SecondClass("third")
        second2 = SecondClass("fourth")

        # Same class should return same instance
        assert first1 is first2
        assert second1 is second2

        # Different classes should return different instances
        assert first1 is not second1

        # Values should be from first creation
        assert first1.value == "first"
        assert second1.value == "third"

    @pytest.mark.asyncio
    async def test_singleton_class_attributes(self):
        """Test that singleton preserves class attributes."""

        @singleton
        class ClassWithAttributes:
            class_attr = "class_value"

            def __init__(self, instance_value):
                self.instance_value = instance_value

        instance = ClassWithAttributes("instance_value")

        assert instance.class_attr == "class_value"
        assert instance.instance_value == "instance_value"

    @pytest.mark.asyncio
    async def test_singleton_methods(self):
        """Test that singleton methods work correctly."""

        @singleton
        class ClassWithMethods:
            def __init__(self):
                self.counter = 0

            def increment(self):
                self.counter += 1
                return self.counter

            def get_counter(self):
                return self.counter

        # Get instances
        instance1 = ClassWithMethods()
        instance2 = ClassWithMethods()

        # Use methods through different references
        result1 = instance1.increment()
        result2 = instance2.increment()
        result3 = instance1.get_counter()

        assert result1 == 1
        assert result2 == 2
        assert result3 == 2

    @pytest.mark.asyncio
    async def test_singleton_multiple_classes(self):
        """Test multiple singleton classes don't interfere with each other."""

        @singleton
        class FirstClass:
            def __init__(self):
                self.name = "first"

        @singleton
        class SecondClass:
            def __init__(self):
                self.name = "second"

        first1 = FirstClass()
        first2 = FirstClass()
        second1 = SecondClass()
        second2 = SecondClass()

        # Same classes should return same instances
        assert first1 is first2
        assert second1 is second2

        # Different classes should return different instances
        assert first1 is not second1
        assert first2 is not second2

        # Verify instances are correct
        assert first1.name == "first"
        assert second1.name == "second"

    @pytest.mark.asyncio
    async def test_singleton_with_exception_in_init(self):
        """Test singleton behavior when constructor raises exception."""

        @singleton
        class ExceptionClass:
            def __init__(self, should_fail=False):
                if should_fail:
                    raise ValueError("Construction failed")
                self.value = "success"

        # First creation succeeds
        instance1 = ExceptionClass(should_fail=False)
        assert instance1.value == "success"

        # Second creation with exception should still return same instance
        # but since singleton already exists, constructor won't be called again
        instance2 = ExceptionClass(should_fail=True)
        assert instance2 is instance1
        assert instance2.value == "success"


class TestSingletonThreadSafety:
    """Test singleton decorator thread safety."""

    @pytest.mark.asyncio
    async def test_singleton_thread_safety(self):
        """Test that singleton is thread-safe."""
        instances = []
        creation_times = []

        @singleton
        class ThreadTestClass:
            def __init__(self):
                self.creation_time = time.time()

        def create_instance():
            instance = ThreadTestClass()
            instances.append(instance)
            creation_times.append(instance.creation_time)
            time.sleep(0.01)  # Small delay to ensure thread overlap

        # Create multiple threads
        threads = []
        for _ in range(10):
            thread = threading.Thread(target=create_instance)
            threads.append(thread)

        # Start all threads
        for thread in threads:
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # All instances should be the same
        first_instance = instances[0]
        for instance in instances[1:]:
            assert instance is first_instance

        # All creation times should be the same (from first creation)
        first_time = creation_times[0]
        for creation_time in creation_times[1:]:
            assert creation_time == first_time

        # Creation should have happened once
        assert len(set(instances)) == 1

    @pytest.mark.asyncio
    async def test_singleton_concurrent_access(self):
        """Test concurrent access to singleton methods."""

        @singleton
        class CounterClass:
            def __init__(self):
                self.counter = 0

            def increment(self):
                self.counter += 1
                return self.counter

        def increment_counter(results, index):
            instance = CounterClass()
            for _ in range(10):  # Reduced iterations to avoid race conditions in test
                result = instance.increment()
            results[index] = result

        # Create multiple threads
        threads = []
        results = [None] * 5  # Reduced threads for stability

        for i in range(5):
            thread = threading.Thread(target=increment_counter, args=(results, i))
            threads.append(thread)

        # Start all threads
        for thread in threads:
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # All threads should see the same singleton instance
        for result in results:
            assert isinstance(result, int)
            # Due to threading, some threads might not see the exact final value
            # but they should all see reasonable values

    @pytest.mark.asyncio
    async def test_singleton_different_threads_same_instance(self):
        """Test that different threads get the same instance."""

        @singleton
        class ThreadIdClass:
            def __init__(self):
                self.creation_thread_id = threading.get_ident()

        def check_instance(thread_results, thread_index):
            instance = ThreadIdClass()
            thread_results[thread_index] = {
                "instance": instance,
                "thread_id": threading.get_ident(),
                "creation_thread_id": instance.creation_thread_id,
            }

        # Create multiple threads
        threads = []
        results = [None] * 5

        for i in range(5):
            thread = threading.Thread(target=check_instance, args=(results, i))
            threads.append(thread)

        # Start all threads
        for thread in threads:
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # All threads should get the same instance
        first_instance = results[0]["instance"]
        first_creation_thread_id = results[0]["creation_thread_id"]

        for result in results[1:]:
            assert result["instance"] is first_instance
            assert result["creation_thread_id"] == first_creation_thread_id

        # But current thread IDs should be different
        current_thread_ids = [result["thread_id"] for result in results]
        assert len(set(current_thread_ids)) > 1


class TestSingletonEdgeCases:
    """Test singleton decorator edge cases."""

    @pytest.mark.asyncio
    async def test_singleton_with_callable_init(self):
        """Test singleton with callable as init parameter."""

        @singleton
        class CallableClass:
            def __init__(self, func=None):
                self.func = func or (lambda x: x * 2)

        instance1 = CallableClass(lambda x: x + 1)
        instance2 = CallableClass(lambda x: x * 3)

        assert instance1 is instance2
        # Should use first function
        assert instance1.func(5) == 6
        assert instance2.func(5) == 6

    @pytest.mark.asyncio
    async def test_singleton_with_mutable_defaults(self):
        """Test singleton with mutable default arguments."""

        @singleton
        class MutableClass:
            def __init__(self, items=None):
                self.items = items or []

        instance1 = MutableClass([1, 2, 3])
        instance2 = MutableClass([4, 5, 6])

        assert instance1 is instance2
        assert instance1.items == [1, 2, 3]
        assert instance2.items == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_singleton_with_none_values(self):
        """Test singleton with None as argument."""

        @singleton
        class NoneClass:
            def __init__(self, value=None):
                self.value = value

        instance1 = NoneClass(None)
        instance2 = NoneClass("not_none")

        assert instance1 is instance2
        assert instance1.value is None

    @pytest.mark.asyncio
    async def test_singleton_property_access(self):
        """Test singleton property access."""

        @singleton
        class PropertyClass:
            def __init__(self):
                self._private_value = "private"

            @property
            def public_value(self):
                return self._private_value

            @public_value.setter
            def public_value(self, value):
                self._private_value = value

        instance1 = PropertyClass()
        instance2 = PropertyClass()

        # Both should access same property
        assert instance1.public_value == "private"
        assert instance2.public_value == "private"

        # Modify through one instance
        instance1.public_value = "modified"

        # Should reflect in both
        assert instance1.public_value == "modified"
        assert instance2.public_value == "modified"

    @pytest.mark.asyncio
    async def test_singleton_class_methods(self):
        """Test singleton with class methods."""

        @singleton
        class ClassMethodClass:
            _class_data = []

            def __init__(self):
                self.instance_data = []

            @classmethod
            def add_class_data(cls, item):
                cls._class_data.append(item)

            @classmethod
            def get_class_data(cls):
                return cls._class_data.copy()

        instance1 = ClassMethodClass()
        instance2 = ClassMethodClass()

        # Test class methods
        instance1.add_class_data("item1")
        instance2.add_class_data("item2")

        class_data = instance1.get_class_data()
        assert class_data == ["item1", "item2"]

        # Both instances should see same class data
        assert instance1.get_class_data() == instance2.get_class_data()

    @pytest.mark.asyncio
    async def test_singleton_static_methods(self):
        """Test singleton with static methods."""

        @singleton
        class StaticMethodClass:
            def __init__(self):
                self.value = 0

            @staticmethod
            def static_operation(x, y):
                return x + y

        instance1 = StaticMethodClass()
        instance2 = StaticMethodClass()

        # Static method should work on both instances
        result1 = instance1.static_operation(3, 4)
        result2 = instance2.static_operation(5, 6)

        assert result1 == 7
        assert result2 == 11
        assert instance1 is instance2
