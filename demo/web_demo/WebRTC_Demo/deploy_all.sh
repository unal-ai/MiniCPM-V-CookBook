#!/bin/bash
# MiniCPM-o 一键部署脚本
# 包含 Docker 服务 + C++ 推理服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================
# 脚本所在目录（自动检测）
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ============================================================
# ⚠️  必须配置的路径 - 请根据实际环境修改
# ============================================================

# llama.cpp-omni 编译后的根目录（包含 build/bin/llama-server）
# 通过 --cpp-dir 或 CPP_DIR 环境变量指定
CPP_DIR="${CPP_DIR:-}"

# GGUF 模型目录
# 通过 --model-dir 或 MODEL_DIR 环境变量指定
MODEL_DIR="${MODEL_DIR:-}"

# Python 解释器路径（自动检测或手动指定）
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 2>/dev/null || command -v python 2>/dev/null || echo "")}"

# ============================================================
# 可选配置（有默认值，通常不需要修改）
# ============================================================

# Python HTTP 服务器脚本路径（默认使用本目录下的 cpp_server/）
SERVER_SCRIPT="${SERVER_SCRIPT:-$SCRIPT_DIR/cpp_server/minicpmo_cpp_http_server.py}"

# 参考音频路径（默认使用本目录下的 cpp_server/assets/）
REF_AUDIO="${REF_AUDIO:-$SCRIPT_DIR/cpp_server/assets/default_ref_audio.wav}"

# 前端源码目录（自动构建并同步到 frontend 容器）
FRONTEND_DIR="${FRONTEND_DIR:-$SCRIPT_DIR/o45-frontend}"
# 默认优先使用 external 构建模式（和线上镜像一致）
FRONTEND_BUILD_SCRIPT="${FRONTEND_BUILD_SCRIPT:-build:external}"
# 是否自动构建前端并同步静态资源到容器（1=开启，0=关闭）
AUTO_BUILD_FRONTEND="${AUTO_BUILD_FRONTEND:-1}"

# ============================================================

# 默认配置
MODE="simplex"  # simplex 或 duplex
PORT=9060

# 解析命令行参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --simplex)
            MODE="simplex"
            shift
            ;;
        --duplex)
            MODE="duplex"
            shift
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        --cpp-dir)
            CPP_DIR="$2"
            shift 2
            ;;
        --model-dir)
            MODEL_DIR="$2"
            shift 2
            ;;
        --python)
            PYTHON_BIN="$2"
            shift 2
            ;;
        --help)
            echo "用法: $0 [选项]"
            echo ""
            echo "必须参数（通过命令行或环境变量指定）:"
            echo "  --cpp-dir PATH     llama.cpp-omni 编译后的根目录 (或设置 CPP_DIR 环境变量)"
            echo "                     该目录需包含 build/bin/llama-server"
            echo "  --model-dir PATH   GGUF 模型目录 (或设置 MODEL_DIR 环境变量)"
            echo ""
            echo "可选参数:"
            echo "  --python PATH      Python 解释器路径 (默认: 自动检测 python3/python)"
            echo "  --simplex          使用单工模式 (默认)"
            echo "  --duplex           使用双工模式"
            echo "  --port PORT        指定推理服务端口 (默认: 9060)"
            echo "  --no-build-frontend  跳过前端自动构建与同步（默认会自动构建）"
            echo "  --help             显示帮助信息"
            echo ""
            echo "说明:"
            echo "  本脚本不会自动下载 llama.cpp-omni 或 GGUF 模型，"
            echo "  请先准备好目录后再通过 --cpp-dir / --model-dir 指定。"
            echo ""
            echo "示例:"
            echo "  $0 --cpp-dir /path/to/llama.cpp-omni --model-dir /path/to/gguf"
            echo ""
            echo "或使用环境变量:"
            echo "  export CPP_DIR=/path/to/llama.cpp-omni"
            echo "  export MODEL_DIR=/path/to/gguf"
            echo "  export AUTO_BUILD_FRONTEND=1"
            echo "  $0 --simplex"
            echo ""
            echo "目录结构说明:"
            echo "  本脚本目录结构:"
            echo "    ./deploy_all.sh              # 本脚本"
            echo "    ./docker-compose.yml         # Docker 编排"
            echo "    ./cpp_server/                # Python 服务代码（已包含）"
            echo "    ./omini_backend_code/        # 后端配置（已包含）"
            echo ""
            echo "  用户需要准备:"
            echo "    CPP_DIR/build/bin/llama-server  # 编译后的 C++ 服务"
            echo "    MODEL_DIR/                       # GGUF 模型文件"
            exit 0
            ;;
        --no-build-frontend)
            AUTO_BUILD_FRONTEND=0
            shift
            ;;
        *)
            echo -e "${RED}未知参数: $1${NC}"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# ============================================================
# 路径验证
# ============================================================
check_required_paths() {
    local has_error=false
    
    # 检查 CPP_DIR
    if [ -z "$CPP_DIR" ]; then
        echo -e "${RED}❌ 错误: 必须指定 llama.cpp-omni 编译目录${NC}"
        echo "   使用 --cpp-dir 参数或设置 CPP_DIR 环境变量"
        has_error=true
    elif [ ! -d "$CPP_DIR" ]; then
        echo -e "${RED}❌ 错误: CPP_DIR 目录不存在: $CPP_DIR${NC}"
        has_error=true
    elif [ ! -f "$CPP_DIR/build/bin/llama-server" ]; then
        echo -e "${RED}❌ 错误: llama-server 未找到: $CPP_DIR/build/bin/llama-server${NC}"
        echo "   请先编译 llama.cpp-omni:"
        echo "     cd $CPP_DIR"
        echo "     cmake -B build -DCMAKE_BUILD_TYPE=Release"
        echo "     cmake --build build --target llama-server -j"
        has_error=true
    fi
    
    # 检查 MODEL_DIR
    if [ -z "$MODEL_DIR" ]; then
        echo -e "${RED}❌ 错误: 必须指定 GGUF 模型目录${NC}"
        echo "   使用 --model-dir 参数或设置 MODEL_DIR 环境变量"
        has_error=true
    elif [ ! -d "$MODEL_DIR" ]; then
        echo -e "${RED}❌ 错误: MODEL_DIR 目录不存在: $MODEL_DIR${NC}"
        has_error=true
    fi
    
    # 检查 PYTHON_BIN
    if [ -z "$PYTHON_BIN" ]; then
        echo -e "${RED}❌ 错误: 找不到 Python 解释器${NC}"
        echo "   使用 --python 参数或设置 PYTHON_BIN 环境变量"
        has_error=true
    elif [ ! -x "$PYTHON_BIN" ]; then
        echo -e "${RED}❌ 错误: Python 解释器不可执行: $PYTHON_BIN${NC}"
        has_error=true
    fi
    
    # 检查本地服务脚本
    if [ ! -f "$SERVER_SCRIPT" ]; then
        echo -e "${RED}❌ 错误: Python 服务脚本不存在: $SERVER_SCRIPT${NC}"
        has_error=true
    fi
    
    # 检查参考音频
    if [ ! -f "$REF_AUDIO" ]; then
        echo -e "${YELLOW}⚠️  参考音频不存在: $REF_AUDIO${NC}"
        echo "   将使用默认音频（如果有）"
    fi
    
    if [ "$has_error" = true ]; then
        echo ""
        echo "使用 --help 查看完整帮助信息"
        exit 1
    fi
}

check_required_paths

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   MiniCPM-o 一键部署脚本${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 获取本机 IP
if command -v ifconfig &> /dev/null; then
    LOCAL_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
elif command -v ip &> /dev/null; then
    LOCAL_IP=$(ip addr show | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}' | cut -d/ -f1)
else
    LOCAL_IP="127.0.0.1"
fi
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="127.0.0.1"
fi

# 后端容器回连宿主机推理服务时使用的地址
# macOS/Windows Docker Desktop 场景优先使用 host.docker.internal，避免取到 VPN/虚拟网卡 IP
SERVICE_IP_FOR_BACKEND="${SERVICE_IP_FOR_BACKEND:-}"
if [ -z "$SERVICE_IP_FOR_BACKEND" ]; then
    if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "cygwin"* ]]; then
        SERVICE_IP_FOR_BACKEND="host.docker.internal"
    else
        SERVICE_IP_FOR_BACKEND="$LOCAL_IP"
    fi
fi

echo -e "${GREEN}🖥️  本机 IP: $LOCAL_IP${NC}"
echo -e "${GREEN}🔗 注册 IP: $SERVICE_IP_FOR_BACKEND${NC}"
echo -e "${GREEN}📋 模式: $MODE${NC}"
echo -e "${GREEN}🔌 端口: $PORT${NC}"
echo -e "${GREEN}📁 CPP_DIR: $CPP_DIR${NC}"
echo -e "${GREEN}📁 MODEL_DIR: $MODEL_DIR${NC}"
echo -e "${GREEN}🧩 自动构建前端: $AUTO_BUILD_FRONTEND${NC}"
echo ""

# ========== 同步 Nginx 到当前推理端口 ==========
NGINX_CONFIG="$SCRIPT_DIR/nginx.conf"
if [ -f "$NGINX_CONFIG" ]; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -E -i '' "s#host\\.docker\\.internal:[0-9]+/v1/#host.docker.internal:${PORT}/v1/#g" "$NGINX_CONFIG"
    else
        sed -E -i "s#host\\.docker\\.internal:[0-9]+/v1/#host.docker.internal:${PORT}/v1/#g" "$NGINX_CONFIG"
    fi
    echo -e "${GREEN}✅ Nginx /api/v1 代理端口已同步为: $PORT${NC}"
fi

# ========== 检查 Docker ==========
echo -e "${YELLOW}[1/8] 检查 Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker 未安装！请先安装 Docker Desktop${NC}"
    echo "   下载地址: https://www.docker.com/products/docker-desktop"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker 未运行！请启动 Docker Desktop${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker 已就绪${NC}"

# ========== 更新 LiveKit 配置 ==========
echo -e "${YELLOW}[2/8] 更新 LiveKit 配置...${NC}"
LIVEKIT_CONFIG="$SCRIPT_DIR/omini_backend_code/config/livekit.yaml"
if [ -f "$LIVEKIT_CONFIG" ]; then
    # macOS 和 Linux 的 sed 语法不同
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/node_ip: .*/node_ip: \"$LOCAL_IP\"/" "$LIVEKIT_CONFIG"
        sed -i '' "s/domain: .*/domain: \"$LOCAL_IP\"/" "$LIVEKIT_CONFIG"
    else
        sed -i "s/node_ip: .*/node_ip: \"$LOCAL_IP\"/" "$LIVEKIT_CONFIG"
        sed -i "s/domain: .*/domain: \"$LOCAL_IP\"/" "$LIVEKIT_CONFIG"
    fi
    echo -e "${GREEN}✅ LiveKit 配置已更新 (IP: $LOCAL_IP)${NC}"
else
    echo -e "${RED}❌ LiveKit 配置文件不存在: $LIVEKIT_CONFIG${NC}"
    exit 1
fi

# ========== 加载 Docker 镜像 ==========
echo -e "${YELLOW}[3/8] 加载 Docker 镜像...${NC}"
cd "$SCRIPT_DIR"

# 加载前端镜像
if [ -f "$SCRIPT_DIR/o45-frontend.tar" ]; then
    echo "   加载前端镜像..."
    docker load -i "$SCRIPT_DIR/o45-frontend.tar"
    echo -e "${GREEN}   ✅ 前端镜像已加载${NC}"
else
    echo -e "${YELLOW}   ⚠️  前端镜像文件不存在: $SCRIPT_DIR/o45-frontend.tar${NC}"
fi

# 加载后端镜像
if [ -f "$SCRIPT_DIR/omini_backend_code/omni_backend.tar" ]; then
    echo "   加载后端镜像..."
    docker load -i "$SCRIPT_DIR/omini_backend_code/omni_backend.tar"
    echo -e "${GREEN}   ✅ 后端镜像已加载${NC}"
else
    echo -e "${YELLOW}   ⚠️  后端镜像文件不存在: $SCRIPT_DIR/omini_backend_code/omni_backend.tar${NC}"
fi

# ========== 启动 Docker 服务 ==========
echo -e "${YELLOW}[4/8] 启动 Docker 服务...${NC}"

# 停止旧服务（含匿名卷，避免残留状态）
docker compose down --remove-orphans --volumes 2>/dev/null || true

# 启动新服务
docker compose up -d

# 等待服务启动
echo "   等待服务启动..."
sleep 10

# 检查服务状态
if docker compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Docker 服务已启动${NC}"
    docker compose ps
else
    echo -e "${RED}❌ Docker 服务启动失败${NC}"
    docker compose logs
    exit 1
fi

build_and_sync_frontend() {
    if [ "$AUTO_BUILD_FRONTEND" != "1" ]; then
        echo -e "${YELLOW}⚠️  已跳过前端自动构建（AUTO_BUILD_FRONTEND=0）${NC}"
        return 0
    fi

    if [ ! -d "$FRONTEND_DIR" ] || [ ! -f "$FRONTEND_DIR/package.json" ]; then
        echo -e "${RED}❌ 前端源码目录不存在或缺少 package.json: $FRONTEND_DIR${NC}"
        return 1
    fi

    if ! command -v node >/dev/null 2>&1; then
        echo -e "${RED}❌ 未检测到 node，无法自动构建前端${NC}"
        return 1
    fi
    if ! command -v npm >/dev/null 2>&1; then
        echo -e "${RED}❌ 未检测到 npm，无法自动构建前端${NC}"
        return 1
    fi

    echo "   构建前端静态资源..."
    pushd "$FRONTEND_DIR" >/dev/null

    if [ ! -d node_modules ]; then
        echo "   安装前端依赖..."
        if [ -f package-lock.json ]; then
            npm ci
        else
            npm install
        fi
    fi

    if ! npm run "$FRONTEND_BUILD_SCRIPT"; then
        if [ "$FRONTEND_BUILD_SCRIPT" != "build" ]; then
            echo -e "${YELLOW}⚠️  构建脚本 $FRONTEND_BUILD_SCRIPT 失败，回退到 npm run build${NC}"
            npm run build
        else
            popd >/dev/null
            return 1
        fi
    fi
    popd >/dev/null

    if [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
        echo -e "${RED}❌ 前端构建完成但 dist/index.html 不存在${NC}"
        return 1
    fi

    # 先清空旧静态资源，再同步新构建产物，避免残留旧 hash 文件干扰
    docker exec minicpmo-frontend sh -lc "rm -rf /usr/share/nginx/html/*" >/dev/null 2>&1 || true

    # 同步到运行中的 frontend 容器，确保本地代码改动生效
    docker cp "$FRONTEND_DIR/dist/." minicpmo-frontend:/usr/share/nginx/html/
    docker exec minicpmo-frontend sh -lc "nginx -s reload >/dev/null 2>&1 || true" >/dev/null 2>&1 || true
    echo -e "${GREEN}✅ 前端静态资源已同步到容器${NC}"
}

# ========== 自动构建并同步前端 ==========
echo -e "${YELLOW}[5/8] 构建并同步前端静态资源...${NC}"
if ! build_and_sync_frontend; then
    echo -e "${RED}❌ 前端构建/同步失败，部署中止${NC}"
    exit 1
fi

# ========== 安装 Python 依赖 ==========
echo -e "${YELLOW}[6/8] 检查 Python 依赖...${NC}"
REQUIREMENTS="$SCRIPT_DIR/cpp_server/requirements.txt"
if [ -f "$REQUIREMENTS" ]; then
    echo "   安装 Python 依赖..."
    "$PYTHON_BIN" -m pip install -q -r "$REQUIREMENTS" 2>/dev/null || {
        echo -e "${YELLOW}⚠️  部分依赖可能未安装，请手动安装: pip install -r $REQUIREMENTS${NC}"
    }
fi
echo -e "${GREEN}✅ Python 环境已就绪${NC}"

# ========== 启动 C++ 推理服务 ==========
echo -e "${YELLOW}[7/8] 启动 C++ 推理服务...${NC}"

# 停止已有的 Python HTTP 服务与可能残留的 llama-server 子进程
pkill -f "minicpmo_cpp_http_server.py" 2>/dev/null || true
pkill -f "minicpmo_cpp_http_server" 2>/dev/null || true
pkill -f "$CPP_DIR/build/bin/llama-server" 2>/dev/null || true
pkill -f "llama-server --host 0.0.0.0 --port 19060" 2>/dev/null || true
sleep 27

# 设置环境变量
export LLAMACPP_ROOT="$CPP_DIR"
export MODEL_DIR="$MODEL_DIR"
export REF_AUDIO="$REF_AUDIO"
export REGISTER_SERVICE_IP="$SERVICE_IP_FOR_BACKEND"

# 启动推理服务
cd "$CPP_DIR"  # 需要在 CPP_DIR 下运行，因为 llama-server 路径是相对的

if [ "$MODE" == "duplex" ]; then
    nohup "$PYTHON_BIN" "$SERVER_SCRIPT" \
        --llamacpp-root "$CPP_DIR" \
        --model-dir "$MODEL_DIR" \
        --port "$PORT" \
        --duplex > /tmp/cpp_server.log 2>&1 &
else
    nohup "$PYTHON_BIN" "$SERVER_SCRIPT" \
        --llamacpp-root "$CPP_DIR" \
        --model-dir "$MODEL_DIR" \
        --port "$PORT" \
        --simplex > /tmp/cpp_server.log 2>&1 &
fi

echo "   等待推理服务启动..."
sleep 15

# 检查服务状态
HEALTH=$(curl -s "http://localhost:$PORT/health" 2>/dev/null || echo "")
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ C++ 推理服务已启动${NC}"
    echo "   $HEALTH"
else
    echo -e "${RED}❌ C++ 推理服务启动失败${NC}"
    echo "   查看日志: tail -f /tmp/cpp_server.log"
    tail -20 /tmp/cpp_server.log 2>/dev/null || true
    exit 1
fi

# ========== 注册推理服务 ==========
echo -e "${YELLOW}[8/8] 注册推理服务...${NC}"
REGISTER_RESULT=$(curl -s -X POST "http://localhost:8025/api/inference/register" \
  -H "Content-Type: application/json" \
  -d "{\"ip\": \"$SERVICE_IP_FOR_BACKEND\", \"port\": $PORT, \"model_port\": $PORT, \"model_type\": \"release\", \"session_type\": \"release\", \"service_name\": \"o45-cpp\"}" 2>/dev/null || echo "")

if echo "$REGISTER_RESULT" | grep -q "service_id\|成功"; then
    echo -e "${GREEN}✅ 推理服务已注册${NC}"
    echo "   $REGISTER_RESULT"
else
    echo -e "${YELLOW}⚠️  注册可能失败，请检查后端服务${NC}"
    echo "   $REGISTER_RESULT"
fi

# ========== 校验服务发现 ==========
echo "   校验推理服务是否可被调度..."
SERVICES_RESULT=$(curl -s "http://localhost:8025/api/inference/services?available_only=false" 2>/dev/null || echo "")
if echo "$SERVICES_RESULT" | grep -Eq '"total":[1-9][0-9]*'; then
    echo -e "${GREEN}✅ 推理服务调度列表正常${NC}"
    echo "   $SERVICES_RESULT"
else
    echo -e "${RED}❌ 推理服务未出现在调度列表，后续可能出现 'Server at capacity'${NC}"
    echo "   /api/inference/services 返回: $SERVICES_RESULT"
    echo "   建议检查日志:"
    echo "     tail -f /tmp/cpp_server.log"
    echo "     cd $SCRIPT_DIR && docker compose logs -f backend"
    exit 1
fi

# ========== 完成 ==========
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✅ 部署完成！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}📌 服务地址：${NC}"
echo "   🌐 前端 Web UI:    http://localhost:3000"
echo "   📡 后端 API:       http://localhost:8025"
echo "   🤖 推理服务:       http://localhost:$PORT"
echo "   🎤 LiveKit:        ws://localhost:7880"
echo ""
echo -e "${GREEN}📋 常用命令：${NC}"
echo "   查看 Docker 日志:  cd $SCRIPT_DIR && docker compose logs -f"
echo "   查看推理日志:      tail -f /tmp/cpp_server.log"
echo "   停止 Docker:       cd $SCRIPT_DIR && docker compose down"
echo "   停止推理服务:      pkill -f minicpmo_cpp_http_server"
echo ""
