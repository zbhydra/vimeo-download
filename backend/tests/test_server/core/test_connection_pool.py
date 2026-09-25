"""Tests for Redis connection pool concurrency behavior."""

import asyncio

import pytest

from app.core.redis import RedisClient


@pytest.mark.asyncio
class TestConnectionPoolConcurrency:
    """Tests for Redis connection pool blocking behavior."""

    async def test_pool_recycling(self):
        """
        Test that connections are recycled back to pool after use.

        Verify that the same connection can be reused for multiple operations.
        """
        client = RedisClient()
        redis = await client.get_client()

        # Perform multiple operations sequentially
        for i in range(10):
            await redis.set(f"test:recycle:{i}", i)
            result = await redis.get(f"test:recycle:{i}")
            assert int(result) == i

        # Cleanup
        for i in range(10):
            await redis.delete(f"test:recycle:{i}")

    async def test_concurrent_independent_operations(self):
        """
        Test that multiple independent operations can run concurrently.
        """
        client = RedisClient()
        redis = await client.get_client()

        # Cleanup first to avoid residual data
        for i in range(5):
            await redis.delete(f"test:counter:{i}")

        async def increment(counter_key: str):
            """Increment a counter multiple times."""
            for _ in range(100):
                await redis.incr(counter_key)

        # Run 5 independent counters concurrently
        tasks = [increment(f"test:counter:{i}") for i in range(5)]
        await asyncio.gather(*tasks)

        # Verify each counter reached 100
        for i in range(5):
            result = await redis.get(f"test:counter:{i}")
            assert int(result) == 100

        # Cleanup
        for i in range(5):
            await redis.delete(f"test:counter:{i}")

    async def test_rapid_acquisition_release(self):
        """
        Test rapidly acquiring and releasing connections.
        """
        client = RedisClient()

        # Simulate burst of short-lived operations
        async def quick_op(op_id: int):
            redis = await client.get_client()
            await redis.set(f"test:quick:{op_id}", op_id)
            await redis.get(f"test:quick:{op_id}")

        # Launch 100 rapid operations
        tasks = [quick_op(i) for i in range(100)]
        await asyncio.gather(*tasks)

        # Cleanup
        redis = await client.get_client()
        for i in range(100):
            await redis.delete(f"test:quick:{i}")
