const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { MarketplaceEntitlementService } = require("@aws-sdk/client-marketplace-entitlement-service");

// DynamoDB 및 MarketplaceEntitlementService 클라이언트 생성
const dynamodb = new DynamoDBClient({ region: 'us-east-1' });
const marketplaceEntitlementService = new MarketplaceEntitlementService({ region: 'us-east-1' });

const { NewSubscribersTableName: newSubscribersTableName } = process.env;


exports.handler = async (event) => {
  await Promise.all(event.Records.map(async (record) => {
    let message;
    let timestamp; // timestamp 변수 선언

    // SQS case
    if (record.body) {
        const { body } = record;
        message = JSON.parse(body).message;
        //timestamp = JSON.parse(body).Timestamp; 
    } else {
    // SNS case
        const { Sns } = record;
        message = JSON.parse(Sns.Message);
        timestamp = Sns.Timestamp; 
    }

    if (typeof message === 'string' || message instanceof String) {
      message = JSON.parse(message);
    }
    
    if (message.action === 'entitlement-updated') {
      const entitlementParams = {
        ProductCode: message['product-code'],
        Filter: {
          CUSTOMER_IDENTIFIER: [message['customer-identifier']],
        },
      };

      try {
        const entitlementsResponse = await marketplaceEntitlementService.getEntitlements(entitlementParams);

        console.log('entitlementsResponse', JSON.stringify(entitlementsResponse));

        const isExpired = new Date(entitlementsResponse.Entitlements[0].ExpirationDate) < new Date();

        // Extract information from the message
        const customerIdentifier = message['customer-identifier'];
        const productCode = message['product-code'];
        const action = message['action'];
          
        const utcTime = new Date(timestamp);
        utcTime.setHours(utcTime.getHours() + 9);
        const koreanTimeString = utcTime.toISOString();
        
        console.log('UTC', timestamp); 
        console.log('한국시간', koreanTimeString); 
      
        
        // If the item doesn't exist or the values are different, add a new item
        const putParams = {
          TableName: newSubscribersTableName,
          Item: {
            'customerIdentifier': { S: customerIdentifier },
            'product-code': { S: productCode },
            'action': { S: action },
            'timestamp': { S: koreanTimeString }, 
          },
          //ConditionExpression: 'attribute_not_exists(customerIdentifier)', // Ensure item doesn't already exist
        };

        await dynamodb.send(new PutItemCommand(putParams));
      } catch (error) {
        console.error('Error adding item to DynamoDB:', error);
        throw error;
      }
    }
  }));

  return {};
};
