cd ./xl_sales
sls remove "$@"

cd ../xl_purchase_orders
sls remove "$@"

cd ../xl_product_mapping
sls remove "$@"

cd ../xl_xledger
sls remove "$@"

cd ../xl_iiko
sls remove "$@"

cd ../resources
sls remove "$@"

cd ..