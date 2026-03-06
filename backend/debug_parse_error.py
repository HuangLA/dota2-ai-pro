"""Debug script to capture detailed parse errors."""
import sys
import asyncio
import traceback
import logging

sys.path.insert(0, '.')

# 设置最详细的日志
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s',
    handlers=[
        logging.FileHandler('data/logs/parse_debug.log'),
        logging.StreamHandler()
    ]
)

from database.sqlite_db import init_database
from services.replay_download_service import ReplayDownloadService
from services.opendota_service import OpenDotaService
from storage.replay_download_storage import ReplayDownloadStorage
from storage.opendota_match_storage import OpenDotaMatchStorage

async def test_download(match_id: int):
    """Test download with full error capture."""
    print(f"\n{'='*60}")
    print(f"Testing download of match {match_id}")
    print(f"{'='*60}\n")
    
    # 初始化数据库
    print("[1/3] Initializing database...")
    init_database('data/truesight.db')
    print("  OK - Database initialized\n")
    
    # 创建服务
    print("[2/3] Creating services...")
    service = ReplayDownloadService(
        opendota_service=OpenDotaService(),
        replay_download_storage=ReplayDownloadStorage(),
        opendota_match_storage=OpenDotaMatchStorage(),
    )
    print("  OK - Services created\n")
    
    # 执行下载
    print("[3/3] Executing download...")
    try:
        result = await service.prepare_and_execute(match_id=match_id)
        
        print(f"\nResult:")
        print(f"  Status: {result.get('status')}")
        print(f"  Task ID: {result.get('task_id')}")
        
        if result.get('error_message'):
            print(f"  ❌ Error: {result.get('error_message')}")
            print(f"  Error code: {result.get('error_code')}")
        else:
            print("  OK - Success")
            
        return result
        
    except Exception as e:
        print(f"\n❌ EXCEPTION CAUGHT:")
        print(f"  Type: {type(e).__name__}")
        print(f"  Message: {str(e)}")
        print(f"  Repr: {repr(e)}")
        print(f"\nFull traceback:")
        traceback.print_exc()
        raise

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_parse_error.py <match_id>")
        print("Example: python debug_parse_error.py 8717664010")
        sys.exit(1)
    
    match_id = int(sys.argv[1])
    asyncio.run(test_download(match_id))
