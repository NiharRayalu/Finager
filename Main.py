# Importing libraries
import imaplib
import email
import re
import csv

import yaml  #To load saved login credentials from a yaml file

def extract_to_csv(paragraph, output_file, write_header=False):
    # Clean up the extra whitespace and newlines
    cleaned_paragraph = paragraph.replace("\r\n", " ").strip()  # Remove \r\n and strip leading/trailing spaces
    cleaned_paragraph = re.sub(r'\s+', ' ', cleaned_paragraph)  # Normalize multiple spaces to a single space

    # Replace "E2 82B9" with "Rs" for amount consistency
    cleaned_paragraph = cleaned_paragraph.replace("E2 82B9", "Rs")

    # Debugging: Print the cleaned paragraph content
    print("Cleaned paragraph for debugging:")
    print(repr(cleaned_paragraph))

    # Regex patterns
    date_pattern = r"(\w+ \d{1,2}, \d{4})"
    receiver_name_pattern = r"Paid to\s+([\w\s]+?)\s+Rs"
    amount_pattern = r"Rs\s*(\d+)"

    # Extract data using regular expressions
    date_match = re.search(date_pattern, cleaned_paragraph)
    receiver_name_match = re.search(receiver_name_pattern, cleaned_paragraph)
    amount_match = re.search(amount_pattern, cleaned_paragraph)

    # Assign values or default to 'Unknown' if not matched
    date = date_match.group(1).strip() if date_match else "Unknown"
    receiver_name = receiver_name_match.group(1).strip() if receiver_name_match else "Unknown"
    amount = amount_match.group(1).strip() if amount_match else "Unknown"

    # Debugging: Print extracted data
    print(f"Extracted Data - Date: {date}, Receiver: {receiver_name}, Amount: {amount}")

    # Append data to the CSV file
    mode = 'a'  # Append mode
    with open(output_file, mode, newline='') as csvfile:
        writer = csv.writer(csvfile)
        if write_header:  # Write the header only once
            writer.writerow(["Date", "Receiver Name", "Amount"])
        writer.writerow([date, receiver_name, amount])



with open("credentials.yml") as f:
    content = f.read()
    
# from credentials.yml import user name and password
my_credentials = yaml.load(content, Loader=yaml.FullLoader)

#Load the user name and passwd from yaml file
user, password = my_credentials["user"], my_credentials["password"]

#URL for IMAP connection
imap_url = 'imap.gmail.com'

# Connection with GMAIL using SSL
my_mail = imaplib.IMAP4_SSL(imap_url)

# Log in using your credentials
my_mail.login(user, password)

# Select the Inbox to fetch messages
my_mail.select('Inbox')

#Define Key and Value for email search
#For other keys (criteria): https://gist.github.com/martinrusev/6121028#file-imap-search
key = 'FROM'
value = 'noreply@phonepe.com'
_, data = my_mail.search(None, key, value)  #Search for emails with specific key and value

mail_id_list = data[0].split()  #IDs of all emails that we want to fetch 

msgs = [] # empty list to capture all messages
#Iterate through messages and extract data into the msgs list
for num in mail_id_list:
    typ, data = my_mail.fetch(num, '(RFC822)') #RFC822 returns whole message (BODY fetches just body)
    msgs.append(data)

#Now we have all messages, but with a lot of details
#Let us extract the right text and print on the screen

#In a multipart e-mail, email.message.Message.get_payload() returns a 
# list with one item for each part. The easiest way is to walk the message 
# and get the payload on each part:
# https://stackoverflow.com/questions/1463074/how-can-i-get-an-email-messages-text-content-using-python

# NOTE that a Message object consists of headers and payloads.
output_file = "sample_extracted_data.csv"
write_header = True  # Ensure header is written only once
for msg in msgs[::-1]:
    for response_part in msg:
        if type(response_part) is tuple:
            my_msg=email.message_from_bytes((response_part[1]))
            print("_")
            for part in my_msg.walk():  
                #print(part.get_content_type())
                if part.get_content_type() == 'text/plain':
                    start_index = part.get_payload().find("=C2=A0")
                    end_index = part.get_payload().find("Txn. ID") + len("Txn. ID")
                    extracted_part = part.get_payload()[start_index:end_index]
                    n1= extracted_part.replace("=", "")
                    N2= n1.replace("E282B9", "Rs")
                    print(N2)
                    # Write to CSV
                    extract_to_csv(N2, output_file, write_header)
                    write_header = False  # Header written, don't write it again
                    
