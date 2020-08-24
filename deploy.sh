cd ./resources
sls deploy "$@"

cd ../xl_iiko
sls deploy "$@"

cd ../xl_xledger
sls deploy "$@"

cd ../xl_product_mapping
sls deploy "$@"

cd ../xl_purchase_orders
sls deploy "$@"

cd ../xl_sales
sls deploy "$@"

cd ..