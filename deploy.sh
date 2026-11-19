#!/usr/bin/env bash
set -euo pipefail

read_env_value() {
    local name="$1"
    local value="${!name:-}"

    if [[ -n "$value" || ! -f .env ]]; then
        printf '%s' "$value"
        return
    fi

    sed -n "s/^${name}=//p" .env | head -n 1 | tr -d '\r'
}

if [[ -n "$(git status --porcelain)" ]]; then
    echo "工作区存在未提交改动，拒绝部署以避免覆盖本地状态。"
    exit 1
fi

current_ref="$(git rev-parse HEAD)"
git fetch --quiet
target_ref="$(git rev-parse '@{u}')"

if ! git merge-base --is-ancestor "$current_ref" "$target_ref"; then
    echo "当前分支无法 fast-forward 到上游，拒绝部署。"
    exit 1
fi

echo "=== 拉取最新代码 ==="
if [[ "$current_ref" == "$target_ref" ]]; then
    echo "已是最新版本"
else
    git merge --ff-only "$target_ref"
fi

echo "=== 校验 Compose 配置 ==="
docker compose config -q

echo "=== 拉取最新镜像 ==="
docker compose pull

echo "=== 替换容器 ==="
docker compose up -d --force-recreate --remove-orphans

echo "=== 检查服务状态 ==="
panel_port="$(read_env_value MODEL_PULSE_PORT)"
panel_port="${panel_port:-3000}"
panel_ready=0
for attempt in {1..12}; do
    if curl -fsS --max-time 5 "http://127.0.0.1:${panel_port}" >/dev/null; then
        echo "服务正常运行：http://127.0.0.1:${panel_port}"
        panel_ready=1
        break
    fi
    sleep 2
done

if [[ "$panel_ready" -ne 1 ]]; then
    echo "服务未在预期端口就绪，请检查日志"
    docker compose logs --tail 20 model-pulse
    exit 1
fi

echo "=== 部署完成 ==="
